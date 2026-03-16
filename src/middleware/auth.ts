import type { MiddlewareHandler } from 'hono'
import type { AuthVariables, Env } from '../types'
import { sha256 } from '../utils/crypto'

/**
 * API Key 认证中间件
 *
 * 优先级：
 * 1. X-API-Key 匹配环境变量 ADMIN_KEY → readwrite（用于初始化）
 * 2. X-API-Key 在 _api_keys 表中存在且 is_active=1 → 返回对应 type
 * 3. 否则 → 401
 *
 * scope=groups 时额外查询允许的表列表，存入 context
 */
export const authMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  const apiKey = c.req.header('X-API-Key') ?? c.req.query('api_key')

  if (!apiKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: '缺少 API Key，请在请求头携带 X-API-Key' } }, 401)
  }

  // 1. 检查环境变量中的 ADMIN_KEY
  if (c.env.ADMIN_KEY && apiKey === c.env.ADMIN_KEY) {
    c.set('keyType', 'readwrite')
    c.set('keyScope', 'all')
    c.set('allowedTables', null)
    return next()
  }

  // 2. 查数据库
  const hash = await sha256(apiKey)
  const row = await c.env.DB.prepare(
    `SELECT id, type, scope FROM _api_keys WHERE key_hash = ? AND is_active = 1 LIMIT 1`
  )
    .bind(hash)
    .first<{ id: number; type: 'readonly' | 'readwrite'; scope: 'all' | 'groups' }>()

  if (!row) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'API Key 无效或已禁用' } }, 401)
  }

  c.set('keyType', row.type)
  c.set('keyScope', row.scope)

  // 3. scope=groups → 查询允许访问的表列表
  if (row.scope === 'groups') {
    const allowed = await c.env.DB.prepare(
      `SELECT DISTINCT gt.table_name
       FROM _api_key_groups akg
       JOIN _group_tables gt ON gt.group_id = akg.group_id
       WHERE akg.key_id = ?`
    )
      .bind(row.id)
      .all<{ table_name: string }>()

    c.set('allowedTables', allowed.results.map(r => r.table_name))
  } else {
    c.set('allowedTables', null)
  }

  return next()
}

/**
 * 写操作保护中间件：readonly key 不允许写操作
 * 在需要写权限的路由上叠加此中间件
 */
export const requireWriteMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  if (c.get('keyType') !== 'readwrite') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: '此操作需要读写权限的 API Key' } },
      403
    )
  }
  return next()
}

/**
 * 表访问控制中间件：检查请求的表名是否在 allowedTables 中
 * 用于 scope=groups 的 Key 限制表访问
 */
export const tableAccessMiddleware: MiddlewareHandler<{
  Bindings: Env
  Variables: AuthVariables
}> = async (c, next) => {
  const allowedTables = c.get('allowedTables')
  if (allowedTables === null) return next() // scope=all，不限制

  const tableName = c.req.param('tableName')
  if (!tableName) return next() // 没有表名参数的路由不需要检查（如 GET /tables）

  if (!allowedTables.includes(tableName)) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: `无权访问表 "${tableName}"` } },
      403
    )
  }
  return next()
}
