import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'

const groups = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// 所有分组管理路由都需要读写权限
groups.use('*', requireWriteMiddleware)

/**
 * GET /api/groups
 * 获取所有分组（含分组内的表名列表）
 */
groups.get('/', async (c) => {
  const [groupRows, gtRows] = await Promise.all([
    c.env.DB
      .prepare(`SELECT id, name, sort_order, created_at FROM _groups ORDER BY sort_order ASC, id ASC`)
      .all<{ id: number; name: string; sort_order: number; created_at: number }>(),
    c.env.DB
      .prepare(`SELECT group_id, table_name FROM _group_tables`)
      .all<{ group_id: number; table_name: string }>(),
  ])

  // 按 group_id 分组
  const tablesByGroup = new Map<number, string[]>()
  for (const r of gtRows.results) {
    const arr = tablesByGroup.get(r.group_id) ?? []
    arr.push(r.table_name)
    tablesByGroup.set(r.group_id, arr)
  }

  const data = groupRows.results.map(g => ({
    ...g,
    tables: tablesByGroup.get(g.id) ?? [],
  }))

  return c.json({ data })
})

/**
 * POST /api/groups
 * 创建分组
 */
groups.post('/', async (c) => {
  const body = await c.req.json<{ name: string; sort_order?: number }>()

  if (!body.name?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Group name cannot be empty' } }, 400)
  }

  try {
    const result = await c.env.DB
      .prepare(`INSERT INTO _groups (name, sort_order) VALUES (?, ?)`)
      .bind(body.name.trim(), body.sort_order ?? 0)
      .run()

    return c.json({ data: { id: result.meta.last_row_id, name: body.name.trim() } }, 201)
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('UNIQUE constraint')) {
      return c.json({ error: { code: 'GROUP_EXISTS', message: `Group "${body.name}" already exists` } }, 409)
    }
    throw err
  }
})

/**
 * PATCH /api/groups/:id
 * 更新分组（名称、排序）
 */
groups.patch('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ name?: string; sort_order?: number }>()

  const sets: string[] = []
  const params: unknown[] = []

  if (body.name?.trim()) {
    sets.push('name = ?')
    params.push(body.name.trim())
  }
  if (body.sort_order !== undefined) {
    sets.push('sort_order = ?')
    params.push(body.sort_order)
  }

  if (sets.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  params.push(id)
  const result = await c.env.DB
    .prepare(`UPDATE _groups SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/groups/:id
 * 删除分组（CASCADE 删除关联关系，表本身不受影响）
 */
groups.delete('/:id', async (c) => {
  const { id } = c.req.param()

  const result = await c.env.DB
    .prepare(`DELETE FROM _groups WHERE id = ?`)
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * PUT /api/groups/:id/tables
 * 设置分组内的表（全量替换）
 * body: { tables: ["tbl_xxx", "tbl_yyy"] }
 */
groups.put('/:id/tables', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ tables: string[] }>()

  if (!Array.isArray(body.tables)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'tables must be an array' } }, 400)
  }

  // 验证分组存在
  const group = await c.env.DB
    .prepare(`SELECT id FROM _groups WHERE id = ?`)
    .bind(id)
    .first()

  if (!group) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`DELETE FROM _group_tables WHERE group_id = ?`).bind(id),
  ]

  for (const tableName of body.tables) {
    stmts.push(
      c.env.DB.prepare(`INSERT INTO _group_tables (group_id, table_name) VALUES (?, ?)`).bind(id, tableName)
    )
  }

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

/**
 * PUT /api/groups/:id/keys
 * 设置分组关联的 API Keys（全量替换）
 * body: { key_ids: [1, 2, 3] }
 */
groups.put('/:id/keys', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ key_ids: number[] }>()

  if (!Array.isArray(body.key_ids)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'key_ids must be an array' } }, 400)
  }

  const group = await c.env.DB
    .prepare(`SELECT id FROM _groups WHERE id = ?`)
    .bind(id)
    .first()

  if (!group) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Group not found' } }, 404)
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`DELETE FROM _api_key_groups WHERE group_id = ?`).bind(id),
  ]

  for (const keyId of body.key_ids) {
    stmts.push(
      c.env.DB.prepare(`INSERT INTO _api_key_groups (key_id, group_id) VALUES (?, ?)`).bind(keyId, id)
    )
  }

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

export default groups
