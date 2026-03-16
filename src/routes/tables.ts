import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { getUserTables, getTableColumns, isValidIdentifier } from '../utils/schema-cache'
import { requireWriteMiddleware } from '../middleware/auth'

// SQLite 类型 → 默认 field_type 映射（与 fields.ts 保持一致）
function inferFieldType(colName: string, sqliteType: string): string {
  const name = colName.toLowerCase()
  const type = sqliteType.toUpperCase()
  if (name === 'id' || name.endsWith('_id')) return 'number'
  if (name.includes('email')) return 'email'
  if (name.includes('url') || name.includes('link') || name.includes('website')) return 'url'
  if (name.includes('phone') || name.includes('tel')) return 'text'
  if (name === 'created_at' || name === 'updated_at') return 'datetime'
  if (name.includes('date')) return 'date'
  if (name.includes('note') || name.includes('desc') || name.includes('content') || name.includes('remark')) return 'longtext'
  if (type === 'INTEGER' && (name.startsWith('is_') || name.startsWith('has_'))) return 'checkbox'
  if (type === 'INTEGER' || type === 'REAL' || type === 'NUMERIC') return 'number'
  return 'text'
}

const tables = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

/**
 * GET /api/tables
 * 获取所有用户表列表
 *
 * D1 成本：读取 sqlite_master（行数极少，<20行），成本可忽略
 * 已通过 cacheMiddleware 缓存 60 秒
 */
tables.get('/', async (c) => {
  // 清除旧版 cacheMiddleware 残留的 Cache API 条目
  try { await caches.default.delete(c.req.raw) } catch {}

  let tableNames = await getUserTables(c.env.DB)

  // scope=groups 时只返回允许的表
  const allowedTables = c.get('allowedTables')
  if (allowedTables !== null) {
    tableNames = tableNames.filter(name => allowedTables.includes(name))
  }

  // 并行获取 _meta（行数+显示名）和分组信息，避免串行等待
  const [metaRows, gtRows] = await Promise.all([
    c.env.DB
      .prepare(`SELECT table_name, title, row_count FROM _meta`)
      .all<{ table_name: string; title: string | null; row_count: number | null }>(),
    c.env.DB
      .prepare(`SELECT gt.table_name, gt.group_id, g.name as group_name
                FROM _group_tables gt JOIN _groups g ON g.id = gt.group_id`)
      .all<{ table_name: string; group_id: number; group_name: string }>(),
  ])

  const titleMap = Object.fromEntries(
    metaRows.results.map((r) => [r.table_name, r.title])
  )
  // 使用 _meta 缓存的行数（由 API 的 insert/delete 实时维护，成本为零）
  const countMap = Object.fromEntries(
    metaRows.results.map((r) => [r.table_name, r.row_count ?? 0])
  )

  const groupsByTable = new Map<string, Array<{ id: number; name: string }>>()
  for (const r of gtRows.results) {
    const arr = groupsByTable.get(r.table_name) ?? []
    arr.push({ id: r.group_id, name: r.group_name })
    groupsByTable.set(r.table_name, arr)
  }

  const result = tableNames.map((name) => ({
    name,
    title: titleMap[name] ?? null,
    row_count: countMap[name] ?? 0,
    groups: groupsByTable.get(name) ?? [],
  }))

  return c.json({ data: result })
})

/**
 * GET /api/tables/:tableName
 * 获取指定表的字段结构
 *
 * D1 成本：PRAGMA table_info 只读该表列数行（通常 <20行）
 */
tables.get('/:tableName', async (c) => {
  try { await caches.default.delete(c.req.raw) } catch {}
  const { tableName } = c.req.param()

  const allTables = await getUserTables(c.env.DB)
  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `表 "${tableName}" 不存在` } }, 404)
  }

  const columns = await getTableColumns(c.env.DB, tableName)

  // 获取显示名和元数据
  const { ensureFieldMeta } = await import('./fields')
  const fieldMeta = await ensureFieldMeta(c.env.DB, tableName)
  const metaByCol = Object.fromEntries(fieldMeta.map(f => [f.column_name, f]))

  // 获取表显示名
  const tableMeta = await c.env.DB
    .prepare(`SELECT title FROM _meta WHERE table_name = ?`)
    .bind(tableName).first<{ title: string | null }>()

  return c.json({
    data: {
      name: tableName,
      title: tableMeta?.title ?? tableName,
      columns: columns.map((col) => ({
        name: col.name,
        title: metaByCol[col.name]?.title ?? col.name,
        type: col.type || 'TEXT',
        field_type: metaByCol[col.name]?.field_type ?? 'text',
        nullable: col.notnull === 0,
        isPrimaryKey: col.pk > 0,
        defaultValue: col.dflt_value,
      })),
    },
  })
})

/**
 * POST /api/tables
 * 建表
 * body: { name: string, columns: [{ name, type, nullable?, defaultValue? }] }
 *
 * 安全：表名和列名均经过 isValidIdentifier 校验，防止 SQL 注入
 */
tables.post('/', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{
    name: string
    title?: string
    columns: Array<{
      name: string
      title?: string
      type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'
      field_type?: string
      nullable?: boolean
      defaultValue?: string
      select_options?: Array<{ value: string; label: string; color: string }>
    }>
  }>()

  if (!body.name || !isValidIdentifier(body.name)) {
    return c.json({ error: { code: 'INVALID_NAME', message: '表名只允许字母、数字、下划线，且不能以数字开头' } }, 400)
  }

  if (!Array.isArray(body.columns) || body.columns.length === 0) {
    return c.json({ error: { code: 'INVALID_COLUMNS', message: '至少需要一个字段' } }, 400)
  }

  // 检查表是否已存在
  const existing = await getUserTables(c.env.DB)
  if (existing.includes(body.name)) {
    return c.json({ error: { code: 'TABLE_EXISTS', message: `表 "${body.name}" 已存在` } }, 409)
  }

  // 校验所有列名
  for (const col of body.columns) {
    if (!isValidIdentifier(col.name)) {
      return c.json({ error: { code: 'INVALID_COLUMN_NAME', message: `字段名 "${col.name}" 不合法` } }, 400)
    }
    const validTypes = ['TEXT', 'INTEGER', 'REAL', 'BLOB']
    if (!validTypes.includes(col.type?.toUpperCase())) {
      return c.json({ error: { code: 'INVALID_TYPE', message: `字段类型 "${col.type}" 不支持，可选：${validTypes.join('/')}` } }, 400)
    }
  }

  // 生成 CREATE TABLE SQL
  const colDefs = body.columns.map((col) => {
    let def = `"${col.name}" ${col.type.toUpperCase()}`
    if (col.nullable === false) def += ' NOT NULL'
    if (col.defaultValue !== undefined && col.defaultValue !== '') {
      def += ` DEFAULT ${col.defaultValue}`
    }
    return def
  })

  const createSQL = `CREATE TABLE "${body.name}" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  ${colDefs.join(',\n  ')},
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
)`

  // 构建所有列的 field_meta 插入语句（包含自动添加的 id 和 created_at）
  const allColumnsForMeta = [
    { name: 'id', type: 'INTEGER', title: 'ID', field_type: 'number', select_options: undefined as Array<{ value: string; label: string; color: string }> | undefined },
    ...body.columns.map(col => ({
      ...col,
      title: col.title?.trim() || col.name,
      field_type: col.field_type || inferFieldType(col.name, col.type),
    })),
    { name: 'created_at', type: 'INTEGER', title: '创建时间', field_type: 'datetime', select_options: undefined },
  ]
  const fieldMetaStmts = allColumnsForMeta.map((col, idx) =>
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO _field_meta (table_name, column_name, title, field_type, select_options, order_index, width)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      body.name,
      col.name,
      col.title,
      col.field_type,
      col.select_options ? JSON.stringify(col.select_options) : null,
      idx * 10,
      col.name === 'id' ? 80 : 180
    )
  )

  const displayTitle = body.title?.trim() || body.name

  await c.env.DB.batch([
    c.env.DB.prepare(createSQL),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO _meta (table_name, row_count, title) VALUES (?, 0, ?)`
    ).bind(body.name, displayTitle),
    ...fieldMetaStmts,
  ])

  return c.json({ data: { name: body.name, message: '建表成功' } }, 201)
})

/**
 * PATCH /api/tables/:tableName
 * 更新表的显示名（改 _meta.title）
 */
tables.patch('/:tableName', requireWriteMiddleware, async (c) => {
  const { tableName } = c.req.param()

  const allTables = await getUserTables(c.env.DB)
  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `表 "${tableName}" 不存在` } }, 404)
  }

  const body = await c.req.json<{ title?: string }>()

  if (!body.title?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: '显示名不能为空' } }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE _meta SET title = ? WHERE table_name = ?`
  ).bind(body.title.trim(), tableName).run()

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/tables/:tableName
 * 删表（危险操作，需读写权限）
 */
tables.delete('/:tableName', requireWriteMiddleware, async (c) => {
  const { tableName } = c.req.param()

  const allTables = await getUserTables(c.env.DB)
  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `表 "${tableName}" 不存在` } }, 404)
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`DROP TABLE "${tableName}"`),
    c.env.DB.prepare(`DELETE FROM _meta WHERE table_name = ?`).bind(tableName),
    c.env.DB.prepare(`DELETE FROM _field_meta WHERE table_name = ?`).bind(tableName),
    c.env.DB.prepare(`DELETE FROM _group_tables WHERE table_name = ?`).bind(tableName),
  ])

  return c.json({ data: { success: true } })
})

export default tables
