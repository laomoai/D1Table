import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware, requireAdminMiddleware } from '../middleware/auth'
import { generateApiKey, sha256 } from '../utils/crypto'

const admin = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// 所有 admin 路由都需要读写权限
admin.use('*', requireWriteMiddleware)

// ── API Key 管理 ──────────────────────────────────────────────

/**
 * GET /api/admin/keys
 * 获取当前用户的 API Key 列表
 */
admin.get('/keys', async (c) => {
  const userId = c.get('userId')

  const keySql = userId !== undefined
    ? `SELECT id, key_prefix, name, type, scope, created_at, is_active FROM _api_keys WHERE (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 200`
    : `SELECT id, key_prefix, name, type, scope, created_at, is_active FROM _api_keys ORDER BY created_at DESC LIMIT 200`

  const rows = userId !== undefined
    ? await c.env.DB.prepare(keySql).bind(userId).all<{ id: number; key_prefix: string; name: string; type: string; scope: string; created_at: number; is_active: number }>()
    : await c.env.DB.prepare(keySql).all<{ id: number; key_prefix: string; name: string; type: string; scope: string; created_at: number; is_active: number }>()

  // 获取每个 key 关联的分组
  const akgRows = await c.env.DB
    .prepare(
      `SELECT akg.key_id, akg.group_id, g.name as group_name
       FROM _api_key_groups akg JOIN _groups g ON g.id = akg.group_id`
    )
    .all<{ key_id: number; group_id: number; group_name: string }>()

  const groupsByKey = new Map<number, Array<{ id: number; name: string }>>()
  for (const r of akgRows.results) {
    const arr = groupsByKey.get(r.key_id) ?? []
    arr.push({ id: r.group_id, name: r.group_name })
    groupsByKey.set(r.key_id, arr)
  }

  const data = rows.results.map(row => ({
    ...row,
    groups: groupsByKey.get(row.id) ?? [],
  }))

  return c.json({ data })
})

/**
 * POST /api/admin/keys
 * 创建新 API Key
 */
admin.post('/keys', async (c) => {
  const body = await c.req.json<{
    name: string
    type?: 'readonly' | 'readwrite'
    scope?: 'all' | 'groups'
    group_ids?: number[]
  }>()

  if (!body.name?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Key name is required' } }, 400)
  }

  const keyType = body.type === 'readwrite' ? 'readwrite' : 'readonly'
  const scope = body.scope === 'groups' ? 'groups' : 'all'
  const plainKey = generateApiKey(keyType)
  const keyHash = await sha256(plainKey)
  const keyPrefix = plainKey.slice(0, 10)

  const insertResult = await c.env.DB
    .prepare(`INSERT INTO _api_keys (key_prefix, key_hash, name, type, scope, user_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(keyPrefix, keyHash, body.name.trim(), keyType, scope, c.get('userId') ?? null)
    .run()

  const newKeyId = insertResult.meta.last_row_id

  // 如果 scope=groups 且提供了 group_ids，插入关联关系
  if (scope === 'groups' && newKeyId && Array.isArray(body.group_ids) && body.group_ids.length > 0) {
    const groupStmts = body.group_ids.map(gid =>
      c.env.DB.prepare(
        `INSERT INTO _api_key_groups (key_id, group_id) VALUES (?, ?)`
      ).bind(newKeyId, gid)
    )
    await c.env.DB.batch(groupStmts)
  }

  return c.json({
    data: {
      key: plainKey,
      key_prefix: keyPrefix,
      name: body.name.trim(),
      type: keyType,
      scope,
      group_ids: scope === 'groups' ? (body.group_ids ?? []) : [],
    },
    message: 'Save this key now — it will not be shown again',
  }, 201)
})

/**
 * PATCH /api/admin/keys/:id
 * 更新 Key 的 scope 和关联分组
 */
admin.patch('/keys/:id', async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')
  const body = await c.req.json<{
    scope?: 'all' | 'groups'
    group_ids?: number[]
  }>()

  // 验证 key 归属
  if (userId !== undefined) {
    const key = await c.env.DB.prepare(
      `SELECT id FROM _api_keys WHERE id = ? AND (user_id = ? OR user_id IS NULL)`
    ).bind(id, userId).first()
    if (!key) return c.json({ error: { code: 'NOT_FOUND', message: 'Key not found' } }, 404)
  }

  const stmts: D1PreparedStatement[] = []

  if (body.scope) {
    stmts.push(
      c.env.DB.prepare(`UPDATE _api_keys SET scope = ? WHERE id = ?`).bind(body.scope, id)
    )
  }

  if (Array.isArray(body.group_ids)) {
    stmts.push(
      c.env.DB.prepare(`DELETE FROM _api_key_groups WHERE key_id = ?`).bind(id)
    )
    for (const gid of body.group_ids) {
      stmts.push(
        c.env.DB.prepare(`INSERT INTO _api_key_groups (key_id, group_id) VALUES (?, ?)`).bind(id, gid)
      )
    }
  }

  if (stmts.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/keys/:id
 * 撤销 API Key（软删除）
 */
admin.delete('/keys/:id', async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')

  let sql = `UPDATE _api_keys SET is_active = 0 WHERE id = ?`
  const params: unknown[] = [id]
  if (userId !== undefined) {
    sql += ` AND (user_id = ? OR user_id IS NULL)`
    params.push(userId)
  }

  const result = await c.env.DB.prepare(sql).bind(...params).run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Key not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

// ── 用户管理（仅 Admin） ────────────────────────────────────────

/**
 * GET /api/admin/users
 * 获取所有用户列表
 */
admin.get('/users', requireAdminMiddleware, async (c) => {
  const rows = await c.env.DB
    .prepare(`SELECT id, email, name, picture, role, status, created_at, last_login FROM _users ORDER BY id ASC`)
    .all<{ id: number; email: string; name: string; picture: string; role: string; status: string; created_at: number; last_login: number | null }>()

  return c.json({ data: rows.results })
})

/**
 * POST /api/admin/users
 * 添加新用户
 */
admin.post('/users', requireAdminMiddleware, async (c) => {
  const body = await c.req.json<{ email: string; name?: string; role?: 'admin' | 'user' }>()

  if (!body.email?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Email is required' } }, 400)
  }

  const email = body.email.trim().toLowerCase()
  const name = body.name?.trim() || email
  const role = body.role === 'admin' ? 'admin' : 'user'

  try {
    const result = await c.env.DB
      .prepare(`INSERT INTO _users (email, name, role) VALUES (?, ?, ?)`)
      .bind(email, name, role)
      .run()

    return c.json({ data: { id: result.meta.last_row_id, email, name, role, status: 'active' } }, 201)
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('UNIQUE constraint')) {
      return c.json({ error: { code: 'USER_EXISTS', message: `User "${email}" already exists` } }, 409)
    }
    throw err
  }
})

/**
 * PATCH /api/admin/users/:id
 * 更新用户（角色、状态）
 */
admin.patch('/users/:id', requireAdminMiddleware, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ role?: 'admin' | 'user'; status?: 'active' | 'disabled' }>()
  const currentUserId = c.get('userId')

  // 不能禁用自己
  if (body.status === 'disabled' && Number(id) === currentUserId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot disable your own account' } }, 400)
  }

  const sets: string[] = []
  const params: unknown[] = []

  if (body.role && ['admin', 'user'].includes(body.role)) {
    sets.push('role = ?')
    params.push(body.role)
  }
  if (body.status && ['active', 'disabled'].includes(body.status)) {
    sets.push('status = ?')
    params.push(body.status)
  }

  if (sets.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  params.push(id)
  const result = await c.env.DB
    .prepare(`UPDATE _users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/users/:id
 * 禁用用户（软删除）
 */
admin.delete('/users/:id', requireAdminMiddleware, async (c) => {
  const { id } = c.req.param()
  const currentUserId = c.get('userId')

  if (Number(id) === currentUserId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot disable your own account' } }, 400)
  }

  const result = await c.env.DB
    .prepare(`UPDATE _users SET status = 'disabled' WHERE id = ?`)
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

export default admin
