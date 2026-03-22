import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { getUserTables, getTableColumns } from '../utils/schema-cache'

const RETENTION_DAYS = 30

const trash = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// 所有回收站路由都需要读写权限
trash.use('*', requireWriteMiddleware)

/**
 * GET /api/trash
 * 获取回收站列表（按删除时间倒序，按 owner 过滤）
 */
trash.get('/', async (c) => {
  const userId = c.get('userId')

  // 自动清理过期记录
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `DELETE FROM _trash WHERE deleted_at < unixepoch() - ?`
    ).bind(RETENTION_DAYS * 86400).run()
  )

  const conditions: string[] = []
  const params: unknown[] = []
  if (userId !== undefined) {
    conditions.push(`(owner_id = ? OR owner_id IS NULL)`)
    params.push(userId)
  }
  // scope=groups 限制：只显示允许访问的表的回收站记录
  const allowedTables = c.get('allowedTables')
  if (allowedTables !== null && allowedTables !== undefined) {
    if (allowedTables.length === 0) {
      return c.json({ data: [] })
    }
    const placeholders = allowedTables.map(() => '?').join(',')
    conditions.push(`table_name IN (${placeholders})`)
    params.push(...allowedTables)
  }
  let sql = `SELECT id, table_name, record_id, record_data, deleted_at FROM _trash`
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`
  }
  sql += ` ORDER BY deleted_at DESC LIMIT 200`

  const rows = await c.env.DB.prepare(sql).bind(...params)
    .all<{ id: number; table_name: string; record_id: number; record_data: string; deleted_at: number }>()

  const data = rows.results.map(r => ({
    id: r.id,
    table_name: r.table_name,
    record_id: r.record_id,
    record_data: JSON.parse(r.record_data),
    deleted_at: new Date(r.deleted_at * 1000).toISOString(),
    expires_at: new Date((r.deleted_at + RETENTION_DAYS * 86400) * 1000).toISOString(),
  }))

  return c.json({ data })
})

/**
 * POST /api/trash/:id/restore
 * 恢复记录到原表
 */
trash.post('/:id/restore', async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')

  let selectSql = `SELECT table_name, record_id, record_data FROM _trash WHERE id = ?`
  const selectParams: unknown[] = [id]
  if (userId !== undefined) {
    selectSql += ` AND (owner_id = ? OR owner_id IS NULL)`
    selectParams.push(userId)
  }

  const row = await c.env.DB.prepare(selectSql).bind(...selectParams)
    .first<{ table_name: string; record_id: number; record_data: string }>()

  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Record not found in trash' } }, 404)
  }

  // 检查原表是否还存在
  const tables = await getUserTables(c.env.DB)
  if (!tables.includes(row.table_name)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Original table "${row.table_name}" no longer exists; cannot restore` } }, 400)
  }

  const record = JSON.parse(row.record_data) as Record<string, unknown>

  // 获取原表的列信息，只恢复存在的列
  const cols = await getTableColumns(c.env.DB, row.table_name)
  const colNames = cols.map(c => c.name)

  const fields = Object.keys(record).filter(k => colNames.includes(k))
  if (fields.length === 0) {
    return c.json({ error: { code: 'RESTORE_FAILED', message: 'Record fields are incompatible with the current table schema' } }, 400)
  }

  const columnList = fields.map(f => `"${f}"`).join(', ')
  const placeholders = fields.map(() => '?').join(', ')
  const values = fields.map(f => record[f])

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO "${row.table_name}" (${columnList}) VALUES (${placeholders})`
      ).bind(...values),
      c.env.DB.prepare(`DELETE FROM _trash WHERE id = ?`).bind(id),
      c.env.DB.prepare(
        `UPDATE _meta SET row_count = row_count + 1, updated_at = unixepoch() WHERE table_name = ?`
      ).bind(row.table_name),
    ])
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('UNIQUE constraint')) {
      return c.json({ error: { code: 'RESTORE_FAILED', message: 'Restore failed: a record with the same ID already exists in the table' } }, 409)
    }
    throw err
  }

  return c.json({ data: { success: true, table_name: row.table_name, record_id: row.record_id } })
})

/**
 * DELETE /api/trash/:id
 * 永久删除回收站中的记录
 */
trash.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')

  let sql = `DELETE FROM _trash WHERE id = ?`
  const params: unknown[] = [id]
  if (userId !== undefined) {
    sql += ` AND (owner_id = ? OR owner_id IS NULL)`
    params.push(userId)
  }

  const result = await c.env.DB.prepare(sql).bind(...params).run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Record not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/trash
 * 清空回收站（仅清空自己的）
 */
trash.delete('/', async (c) => {
  const userId = c.get('userId')
  if (userId !== undefined) {
    await c.env.DB.prepare(`DELETE FROM _trash WHERE owner_id = ? OR owner_id IS NULL`).bind(userId).run()
  } else {
    await c.env.DB.prepare(`DELETE FROM _trash`).run()
  }
  return c.json({ data: { success: true } })
})

export default trash
