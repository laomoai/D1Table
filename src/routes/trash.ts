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
 * 获取回收站列表（按删除时间倒序）
 * 同时自动清理超过 30 天的记录
 */
trash.get('/', async (c) => {
  // 自动清理过期记录
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `DELETE FROM _trash WHERE deleted_at < unixepoch() - ?`
    ).bind(RETENTION_DAYS * 86400).run()
  )

  const rows = await c.env.DB
    .prepare(
      `SELECT id, table_name, record_id, record_data, deleted_at
       FROM _trash
       ORDER BY deleted_at DESC
       LIMIT 200`
    )
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

  const row = await c.env.DB
    .prepare(`SELECT table_name, record_id, record_data FROM _trash WHERE id = ?`)
    .bind(id)
    .first<{ table_name: string; record_id: number; record_data: string }>()

  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: '回收站中无此记录' } }, 404)
  }

  // 检查原表是否还存在
  const tables = await getUserTables(c.env.DB)
  if (!tables.includes(row.table_name)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `原表 "${row.table_name}" 已不存在，无法恢复` } }, 400)
  }

  const record = JSON.parse(row.record_data) as Record<string, unknown>

  // 获取原表的列信息，只恢复存在的列
  const cols = await getTableColumns(c.env.DB, row.table_name)
  const colNames = cols.map(c => c.name)

  const fields = Object.keys(record).filter(k => colNames.includes(k))
  if (fields.length === 0) {
    return c.json({ error: { code: 'RESTORE_FAILED', message: '记录字段与当前表结构不兼容' } }, 400)
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
      return c.json({ error: { code: 'RESTORE_FAILED', message: '恢复失败：原表中已存在相同 ID 的记录' } }, 409)
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

  const result = await c.env.DB
    .prepare(`DELETE FROM _trash WHERE id = ?`)
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: '记录不存在' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/trash
 * 清空回收站
 */
trash.delete('/', async (c) => {
  await c.env.DB.prepare(`DELETE FROM _trash`).run()
  return c.json({ data: { success: true } })
})

export default trash
