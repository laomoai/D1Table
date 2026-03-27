import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { getUserTables, getTableColumns } from '../utils/schema-cache'

const RETENTION_DAYS = 30

type TableSnapshot = {
  __kind: 'table'
  table_name: string
  meta: {
    title: string | null
    row_count: number
    icon: string | null
    is_locked: number
    owner_id: number | null
    team_id: number | null
  }
  columns: Array<{
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }>
  field_meta: Array<{
    column_name: string
    title: string
    field_type: string
    select_options: string | null
    order_index: number
    width: number
    is_hidden: number
  }>
  link_meta: Array<{
    source_field: string
    target_table: string
  }>
  inbound_link_meta?: Array<{
    source_table: string
    source_field: string
    target_table: string
  }>
  group_ids: number[]
  dashboard_config: string | null
  rows: Array<Record<string, unknown>>
}

function isTableSnapshot(value: unknown): value is TableSnapshot {
  return !!value
    && typeof value === 'object'
    && (value as { __kind?: string }).__kind === 'table'
}

function normalizeDefaultValue(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('(') || trimmed.startsWith("'") || trimmed.startsWith('"')) return trimmed
  if (/^[A-Za-z_][A-Za-z0-9_]*\(.*\)$/.test(trimmed)) {
    return `(${trimmed})`
  }
  return trimmed
}

function buildCreateTableSql(tableName: string, columns: TableSnapshot['columns']): string {
  const defs = columns.map((col) => {
    if (col.name === 'id' && col.pk > 0 && col.type.toUpperCase() === 'INTEGER') {
      return `"id" INTEGER PRIMARY KEY AUTOINCREMENT`
    }

    let def = `"${col.name}" ${col.type || 'TEXT'}`
    if (col.pk > 0) def += ' PRIMARY KEY'
    if (col.notnull) def += ' NOT NULL'
    const normalizedDefault = normalizeDefaultValue(col.dflt_value)
    if (normalizedDefault !== null) def += ` DEFAULT ${normalizedDefault}`
    return def
  })

  return `CREATE TABLE "${tableName}" (${defs.join(', ')})`
}

function canAccessTrashItem(
  record: Record<string, unknown>,
  tableName: string,
  allowedTables: string[] | null | undefined,
  allowedGroupIds: number[] | null | undefined,
): boolean {
  if (allowedTables === null || allowedTables === undefined) return true
  if (allowedTables.includes(tableName)) return true
  if (isTableSnapshot(record)) {
    if (allowedGroupIds === null || allowedGroupIds === undefined) return false
    return record.group_ids.some((groupId) => allowedGroupIds.includes(groupId))
  }
  return false
}

const trash = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// 所有回收站路由都需要读写权限
trash.use('*', requireWriteMiddleware)

/**
 * GET /api/trash
 * 获取回收站列表（按删除时间倒序，按 owner 过滤）
 */
trash.get('/', async (c) => {
  // 自动清理过期记录
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `DELETE FROM _trash WHERE deleted_at < unixepoch() - ?`
    ).bind(RETENTION_DAYS * 86400).run()
  )

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('page_size') ?? '20', 10) || 20))

  const teamId = c.get('teamId')
  const conditions: string[] = []
  const params: unknown[] = []
  if (teamId !== undefined) {
    conditions.push(`team_id = ?`)
    params.push(teamId)
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const rows = await c.env.DB.prepare(
    `SELECT id, table_name, record_id, record_data, deleted_at FROM _trash${where} ORDER BY deleted_at DESC`
  ).bind(...params).all<{ id: number; table_name: string; record_id: number; record_data: string; deleted_at: number }>()

  const allowedTables = c.get('allowedTables')
  const allowedGroupIds = c.get('allowedGroupIds')
  const filteredRows = rows.results.filter((row) => {
    const record = JSON.parse(row.record_data) as Record<string, unknown>
    return canAccessTrashItem(record, row.table_name, allowedTables, allowedGroupIds)
  })

  const pageRows = filteredRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
  const data = pageRows.map(r => ({
    id: r.id,
    table_name: r.table_name,
    record_id: r.record_id,
    record_data: JSON.parse(r.record_data),
    deleted_at: new Date(r.deleted_at * 1000).toISOString(),
    expires_at: new Date((r.deleted_at + RETENTION_DAYS * 86400) * 1000).toISOString(),
  }))

  return c.json({ data, meta: { total: filteredRows.length, page, page_size: pageSize } })
})

/**
 * POST /api/trash/:id/restore
 * 恢复记录到原表
 */
trash.post('/:id/restore', async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')

  let selectSql = `SELECT table_name, record_id, record_data FROM _trash WHERE id = ?`
  const selectParams: unknown[] = [id]
  if (teamId !== undefined) {
    selectSql += ` AND team_id = ?`
    selectParams.push(teamId)
  }

  const row = await c.env.DB.prepare(selectSql).bind(...selectParams)
    .first<{ table_name: string; record_id: number; record_data: string }>()

  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Record not found in trash' } }, 404)
  }

  const record = JSON.parse(row.record_data) as Record<string, unknown>
  const allowedTables = c.get('allowedTables')
  const allowedGroupIds = c.get('allowedGroupIds')

  if (!canAccessTrashItem(record, row.table_name, allowedTables, allowedGroupIds)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'This trash item is not accessible' } }, 403)
  }

  if (isTableSnapshot(record)) {
    const existingTables = await getUserTables(c.env.DB)
    if (existingTables.includes(record.table_name)) {
      return c.json({ error: { code: 'TABLE_EXISTS', message: `Table "${record.table_name}" already exists; cannot restore` } }, 409)
    }

    const statements = [
      c.env.DB.prepare(buildCreateTableSql(record.table_name, record.columns)),
      c.env.DB.prepare(
        `INSERT INTO _meta (table_name, row_count, updated_at, title, icon, is_locked, owner_id, team_id)
         VALUES (?, ?, unixepoch(), ?, ?, ?, ?, ?)`
      ).bind(
        record.table_name,
        record.meta.row_count ?? record.rows.length,
        record.meta.title,
        record.meta.icon,
        record.meta.is_locked,
        record.meta.owner_id,
        record.meta.team_id,
      ),
      ...record.field_meta.map((field) =>
        c.env.DB.prepare(
          `INSERT INTO _field_meta (table_name, column_name, title, field_type, select_options, order_index, width, is_hidden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          record.table_name,
          field.column_name,
          field.title,
          field.field_type,
          field.select_options,
          field.order_index,
          field.width,
          field.is_hidden,
        )
      ),
      ...record.link_meta.map((link) =>
        c.env.DB.prepare(
          `INSERT INTO _link_meta (source_table, source_field, target_table) VALUES (?, ?, ?)`
        ).bind(record.table_name, link.source_field, link.target_table)
      ),
      ...((record.inbound_link_meta ?? []).map((link) =>
        c.env.DB.prepare(
          `INSERT INTO _link_meta (source_table, source_field, target_table) VALUES (?, ?, ?)`
        ).bind(link.source_table, link.source_field, link.target_table)
      )),
      ...record.group_ids.map((groupId) =>
        c.env.DB.prepare(
          `INSERT INTO _group_tables (group_id, table_name)
           SELECT id, ? FROM _groups WHERE id = ?`
        ).bind(record.table_name, groupId)
      ),
      ...(record.dashboard_config
        ? [c.env.DB.prepare(
            `INSERT INTO _dashboards (table_name, config, updated_at, owner_id, team_id)
             VALUES (?, ?, unixepoch(), ?, ?)`
          ).bind(record.table_name, record.dashboard_config, record.meta.owner_id, record.meta.team_id)]
        : []),
      ...record.rows.flatMap((tableRow) => {
        const fields = Object.keys(tableRow)
        if (fields.length === 0) return []
        const columnList = fields.map((field) => `"${field}"`).join(', ')
        const placeholders = fields.map(() => '?').join(', ')
        return [
          c.env.DB.prepare(
            `INSERT INTO "${record.table_name}" (${columnList}) VALUES (${placeholders})`
          ).bind(...fields.map((field) => tableRow[field])),
        ]
      }),
      c.env.DB.prepare(`DELETE FROM _trash WHERE id = ?`).bind(id),
    ]

    await c.env.DB.batch(statements)
    return c.json({ data: { success: true, table_name: record.table_name, record_id: 0 } })
  }

  // 检查原表是否还存在
  const tables = await getUserTables(c.env.DB)
  if (!tables.includes(row.table_name)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Original table "${row.table_name}" no longer exists; cannot restore` } }, 400)
  }

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
  const teamId = c.get('teamId')
  let sql = `SELECT id, table_name, record_data FROM _trash WHERE id = ?`
  const params: unknown[] = [id]
  if (teamId !== undefined) {
    sql += ` AND team_id = ?`
    params.push(teamId)
  }

  const row = await c.env.DB.prepare(sql).bind(...params)
    .first<{ id: number; table_name: string; record_data: string }>()

  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Record not found' } }, 404)
  }

  const record = JSON.parse(row.record_data) as Record<string, unknown>
  if (!canAccessTrashItem(record, row.table_name, c.get('allowedTables'), c.get('allowedGroupIds'))) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'This trash item is not accessible' } }, 403)
  }

  await c.env.DB.prepare(`DELETE FROM _trash WHERE id = ?`).bind(id).run()

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/trash
 * 清空回收站（仅清空自己的）
 */
trash.delete('/', async (c) => {
  const teamId = c.get('teamId')
  const allowedTables = c.get('allowedTables')
  const allowedGroupIds = c.get('allowedGroupIds')

  let sql = `SELECT id, table_name, record_data FROM _trash`
  const params: unknown[] = []
  if (teamId !== undefined) {
    sql += ` WHERE team_id = ?`
    params.push(teamId)
  }

  const rows = await c.env.DB.prepare(sql).bind(...params)
    .all<{ id: number; table_name: string; record_data: string }>()

  const accessibleIds = rows.results
    .filter((row) => canAccessTrashItem(JSON.parse(row.record_data), row.table_name, allowedTables, allowedGroupIds))
    .map((row) => row.id)

  if (accessibleIds.length === 0) {
    return c.json({ data: { success: true } })
  }

  const placeholders = accessibleIds.map(() => '?').join(',')
  await c.env.DB.prepare(`DELETE FROM _trash WHERE id IN (${placeholders})`).bind(...accessibleIds).run()
  return c.json({ data: { success: true } })
})

export default trash
