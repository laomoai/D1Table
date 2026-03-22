import type { MiddlewareHandler } from 'hono'
import type { AuthVariables, Env } from '../types'
import { sha256 } from '../utils/crypto'
import { verifySession } from '../utils/session'

/**
 * API Key / Session 认证中间件
 *
 * 优先级：
 * 1. Session cookie → 查 _users 表获取 userId
 * 2. ADMIN_KEY → 超级管理员（无 userId，绕过 owner 校验）
 * 3. _api_keys 表 → 继承 key 的 user_id
 */
export const authMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  // 1. 尝试 session cookie 认证（web UI）
  const cookieHeader = c.req.header('Cookie')
  if (cookieHeader) {
    const user = await verifySession(cookieHeader, c.env.SESSION_SECRET)
    if (user) {
      // 查 _users 表确认用户存在且未禁用
      const userRow = await c.env.DB.prepare(
        `SELECT id, role FROM _users WHERE email = ? AND status = 'active' LIMIT 1`
      ).bind(user.email).first<{ id: number; role: 'admin' | 'user' }>()

      if (!userRow) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'User account not found or disabled' } }, 401)
      }

      c.set('keyType', 'readwrite')
      c.set('keyScope', 'all')
      c.set('allowedTables', null)
      c.set('allowedGroupIds', null)
      c.set('user', user)
      c.set('userId', userRow.id)
      c.set('userRole', userRow.role)
      return next()
    }
  }

  // 2. API Key 认证
  const apiKey = c.req.header('X-API-Key') ?? c.req.query('api_key')

  if (!apiKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing API Key. Include it in the X-API-Key request header' } }, 401)
  }

  // 2a. ADMIN_KEY：超级管理员，不设 userId，绕过所有 owner 校验
  if (c.env.ADMIN_KEY && apiKey === c.env.ADMIN_KEY) {
    c.set('keyType', 'readwrite')
    c.set('keyScope', 'all')
    c.set('allowedTables', null)
    c.set('allowedGroupIds', null)
    return next()
  }

  // 2b. 数据库 API Key
  const hash = await sha256(apiKey)
  const row = await c.env.DB.prepare(
    `SELECT id, type, scope, user_id FROM _api_keys WHERE key_hash = ? AND is_active = 1 LIMIT 1`
  )
    .bind(hash)
    .first<{ id: number; type: 'readonly' | 'readwrite'; scope: 'all' | 'groups'; user_id: number | null }>()

  if (!row) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or disabled API Key' } }, 401)
  }

  c.set('keyType', row.type)
  c.set('keyScope', row.scope)

  // 异步更新 last_used_at（不阻塞请求）
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE _api_keys SET last_used_at = unixepoch() WHERE id = ?`).bind(row.id).run()
  )

  // 设置 userId（API Key 继承创建者的 user_id）
  if (row.user_id) {
    c.set('userId', row.user_id)
  }

  // scope=groups → 查询允许访问的表列表和组 ID
  if (row.scope === 'groups') {
    const [allowed, groupIds] = await Promise.all([
      c.env.DB.prepare(
        `SELECT DISTINCT gt.table_name
         FROM _api_key_groups akg
         JOIN _group_tables gt ON gt.group_id = akg.group_id
         WHERE akg.key_id = ?`
      ).bind(row.id).all<{ table_name: string }>(),
      c.env.DB.prepare(
        `SELECT group_id FROM _api_key_groups WHERE key_id = ?`
      ).bind(row.id).all<{ group_id: number }>(),
    ])

    c.set('allowedTables', allowed.results.map(r => r.table_name))
    c.set('allowedGroupIds', groupIds.results.map(r => r.group_id))
  } else {
    c.set('allowedTables', null)
    c.set('allowedGroupIds', null)
  }

  return next()
}

/**
 * 写操作保护中间件：readonly key 不允许写操作
 */
export const requireWriteMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  if (c.get('keyType') !== 'readwrite') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'This operation requires a read-write API Key' } },
      403
    )
  }
  return next()
}

/**
 * 表访问控制中间件：
 * 1. scope=groups 的 Key 只能访问关联分组内的表
 * 2. 有 userId 时验证表的 owner_id 匹配
 */
export const tableAccessMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  const tableName = c.req.param('tableName')
  if (!tableName) return next()

  // scope=groups 限制
  const allowedTables = c.get('allowedTables')
  if (allowedTables !== null && allowedTables !== undefined) {
    if (!allowedTables.includes(tableName)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: `Access to table "${tableName}" is not allowed` } },
        403
      )
    }
  }

  // owner 校验：有 userId 时检查表归属
  const userId = c.get('userId')
  if (userId !== undefined) {
    const meta = await c.env.DB.prepare(
      `SELECT owner_id FROM _meta WHERE table_name = ?`
    ).bind(tableName).first<{ owner_id: number | null }>()

    // 表存在于 _meta 且有 owner_id 且不匹配 → 拒绝
    if (meta && meta.owner_id !== null && meta.owner_id !== userId) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: `Access to table "${tableName}" is not allowed` } },
        403
      )
    }
  }

  return next()
}

/**
 * Admin 角色保护中间件
 */
export const requireAdminMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  if (c.get('userRole') !== 'admin') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      403
    )
  }
  return next()
}
