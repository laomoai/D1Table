import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { generateApiKey, sha256 } from '../utils/crypto'

const admin = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// 所有 admin 路由都需要读写权限
admin.use('*', requireWriteMiddleware)

/**
 * GET /api/admin/keys
 * 获取所有 API Key 列表（不返回明文和完整哈希）
 * 包含每个 Key 关联的分组信息
 */
admin.get('/keys', async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT id, key_prefix, name, type, scope, created_at, is_active FROM _api_keys ORDER BY created_at DESC LIMIT 200`
    )
    .all<{ id: number; key_prefix: string; name: string; type: string; scope: string; created_at: number; is_active: number }>()

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
 * 明文只返回一次，之后无法查看
 * 支持 scope + group_ids
 */
admin.post('/keys', async (c) => {
  const body = await c.req.json<{
    name: string
    type?: 'readonly' | 'readwrite'
    scope?: 'all' | 'groups'
    group_ids?: number[]
  }>()

  if (!body.name?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: '请提供 Key 的名称' } }, 400)
  }

  const keyType = body.type === 'readwrite' ? 'readwrite' : 'readonly'
  const scope = body.scope === 'groups' ? 'groups' : 'all'
  const plainKey = generateApiKey(keyType)
  const keyHash = await sha256(plainKey)
  const keyPrefix = plainKey.slice(0, 10)

  const insertResult = await c.env.DB
    .prepare(`INSERT INTO _api_keys (key_prefix, key_hash, name, type, scope) VALUES (?, ?, ?, ?, ?)`)
    .bind(keyPrefix, keyHash, body.name.trim(), keyType, scope)
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
    message: '请保存此 Key，关闭后将无法再次查看',
  }, 201)
})

/**
 * PATCH /api/admin/keys/:id
 * 更新 Key 的 scope 和关联分组
 */
admin.patch('/keys/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    scope?: 'all' | 'groups'
    group_ids?: number[]
  }>()

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
    return c.json({ error: { code: 'INVALID_BODY', message: '没有有效字段' } }, 400)
  }

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/keys/:id
 * 撤销 API Key（软删除，设置 is_active=0）
 */
admin.delete('/keys/:id', async (c) => {
  const { id } = c.req.param()

  const result = await c.env.DB
    .prepare(`UPDATE _api_keys SET is_active = 0 WHERE id = ?`)
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Key 不存在' } }, 404)
  }

  return c.json({ data: { success: true } })
})

export default admin
