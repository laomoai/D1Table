import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { getUserTables, getTableColumns, isValidIdentifier } from '../utils/schema-cache'
import { buildSelectSQL, parseFilters } from '../utils/query-builder'
import { requireWriteMiddleware } from '../middleware/auth'
import { getFieldMeta } from './fields'

const records = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

type SelectOpt = { id?: string; value: string; label: string; color: string }
type FieldMetaRow = { column_name: string; field_type: string; select_options: unknown[] | null }

const SELECT_COLORS = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']

/**
 * 针对多行数据，检查 select 字段中是否有不存在的选项值，
 * 若有则自动追加并返回需要更新 _field_meta 的 PreparedStatement 列表。
 */
function buildSelectOptionStmts(
  db: D1Database,
  tableName: string,
  fieldMeta: FieldMetaRow[],
  rows: Record<string, unknown>[],
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = []

  for (const field of fieldMeta) {
    if (field.field_type !== 'select') continue

    const existing = (field.select_options ?? []) as SelectOpt[]
    const existingValues = new Set(existing.map(o => o.value))

    // 收集所有行中该字段的新值（去重）
    const newValues: string[] = []
    for (const row of rows) {
      const val = row[field.column_name]
      if (val == null || val === '') continue
      const str = String(val)
      if (!existingValues.has(str) && !newValues.includes(str)) {
        newValues.push(str)
      }
    }

    if (newValues.length === 0) continue

    const updated = [...existing]
    for (let i = 0; i < newValues.length; i++) {
      updated.push({
        id: Math.random().toString(36).slice(2, 10),
        value: newValues[i],
        label: newValues[i],
        color: SELECT_COLORS[(existing.length + i) % SELECT_COLORS.length],
      })
    }

    stmts.push(
      db.prepare(`UPDATE _field_meta SET select_options = ? WHERE table_name = ? AND column_name = ?`)
        .bind(JSON.stringify(updated), tableName, field.column_name)
    )
  }

  return stmts
}

/**
 * GET /api/tables/:tableName/records
 *
 * 查询参数：
 *   page_size=20          每页条数（默认20，最大100）
 *   cursor=<id>           上一页最后一条 id（keyset 分页）
 *   filter[field]=value   筛选（eq）
 *   filter[field__gt]=v   筛选（gt/gte/lt/lte/like/nlike/ne）
 *   sort=field:asc|desc   排序
 *   fields=f1,f2          只返回指定字段
 *
 * D1 成本优化：
 * - keyset 分页：只读 page_size 行，不扫描历史数据
 * - fields 指定字段：减少数据传输和 Worker 处理量
 * - 不做 COUNT(*)：避免全表扫描；total 从 _meta 表取（1行）
 */
records.get('/:tableName/records', async (c) => {
  const { tableName } = c.req.param()
  const query = c.req.query()

  // 三个独立查询并行：表存在验证 + 列结构（构建 SQL 用）+ 字段展示元数据
  const [allTables, cols, fieldMeta] = await Promise.all([
    getUserTables(c.env.DB),
    getTableColumns(c.env.DB, tableName),
    getFieldMeta(c.env.DB, tableName),
  ])

  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  const allColumns = cols.map((c) => c.name)

  // 解析 fields 参数（白名单校验）
  const requestedFields = query.fields
    ? query.fields.split(',').filter((f) => allColumns.includes(f.trim())).map((f) => f.trim())
    : []

  // 解析筛选条件（白名单校验在 parseFilters 内完成）
  const filters = parseFilters(query, allColumns)

  // 解析排序
  let sort: { field: string; dir: 'ASC' | 'DESC' } | undefined
  if (query.sort) {
    const [field, dir] = query.sort.split(':')
    if (field && allColumns.includes(field)) {
      sort = { field, dir: dir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' }
    }
  }

  // 解析分页参数
  const pageSize = Math.min(parseInt(query.page_size ?? '20', 10) || 20, 100)
  const hasPageParam = query.page !== undefined
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1)
  const cursor = query.cursor ? parseInt(query.cursor, 10) : undefined
  // page 参数优先于 cursor；二者同时存在时忽略 cursor
  const offset = hasPageParam && page > 1 ? (page - 1) * pageSize : undefined

  const { sql, params } = buildSelectSQL({
    tableName,
    selectFields: requestedFields,
    filters,
    sort,
    cursor: hasPageParam ? undefined : cursor,
    pageSize,
    offset,
  })

  const result = await c.env.DB.prepare(sql).bind(...params).all()
  const rows = result.results as Record<string, unknown>[]

  // next_cursor：取最后一条记录的 id
  const lastRow = rows[rows.length - 1]
  const nextCursor =
    rows.length === pageSize && lastRow && 'id' in lastRow
      ? String(lastRow.id)
      : null

  const fields: Record<string, { title: string; field_type: string }> = {}
  for (const f of fieldMeta) {
    fields[f.column_name] = { title: f.title, field_type: f.field_type }
  }

  // 格式化日期时间字段（Unix 时间戳 → ISO 8601）
  const formattedRows = formatDatetimeFields(rows, fieldMeta)

  return c.json({
    data: formattedRows,
    fields,
    meta: {
      page_size: pageSize,
      count: rows.length,
      next_cursor: nextCursor,
    },
  })
})

/**
 * GET /api/tables/:tableName/records/:id
 * 查询单条记录
 * D1 成本：通过主键查询，1行
 */
records.get('/:tableName/records/:id', async (c) => {
  const { tableName, id } = c.req.param()

  // 表验证 + 数据 + 字段元数据并行
  const [allTables, rowResult, fieldMeta] = await Promise.all([
    getUserTables(c.env.DB),
    c.env.DB.prepare(`SELECT * FROM "${tableName}" WHERE id = ? LIMIT 1`).bind(id).first(),
    getFieldMeta(c.env.DB, tableName),
  ])

  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  if (!rowResult) {
    return c.json({ error: { code: 'RECORD_NOT_FOUND', message: 'Record not found' } }, 404)
  }

  const fields: Record<string, { title: string; field_type: string }> = {}
  for (const f of fieldMeta) {
    fields[f.column_name] = { title: f.title, field_type: f.field_type }
  }

  const [formattedRow] = formatDatetimeFields([rowResult as Record<string, unknown>], fieldMeta)

  return c.json({ data: formattedRow, fields })
})

/**
 * POST /api/tables/:tableName/records
 * 新增记录
 * D1 成本：1行写入 + 1行写入（_meta 计数更新）
 */
records.post('/:tableName/records', requireWriteMiddleware, async (c) => {
  const { tableName } = c.req.param()

  const [allTables, cols, fieldMeta] = await Promise.all([
    getUserTables(c.env.DB),
    getTableColumns(c.env.DB, tableName),
    getFieldMeta(c.env.DB, tableName),
  ])

  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  // 排除主键（自增）以及有 SQL 表达式默认值的列（如 created_at DEFAULT (unixepoch())）
  // 这类列由数据库自动填写，用户传 null 会触发 NOT NULL 违反
  const writableCols = cols.filter(
    (c) => c.pk === 0 && !(c.dflt_value?.includes('('))
  )
  const allowedNames = writableCols.map((c) => c.name)

  const body = await c.req.json<Record<string, unknown>>()

  // 只保留合法字段
  const fields = Object.keys(body).filter((k) => allowedNames.includes(k))
  if (fields.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided in request body' } }, 400)
  }

  const values = fields.map((f) => body[f])
  const placeholders = fields.map(() => '?').join(', ')
  const columnList = fields.map((f) => `"${f}"`).join(', ')

  // 前置校验：NOT NULL 且无默认值的字段不能为 null
  const requiredCols = writableCols.filter((c) => c.notnull === 1 && c.dflt_value === null)
  const missing = requiredCols.filter((c) => {
    const val = body[c.name]
    return val === null || val === undefined || val === ''
  })
  if (missing.length > 0) {
    return c.json({
      error: {
        code: 'REQUIRED_FIELDS_MISSING',
        message: `The following fields are required: ${missing.map((c) => c.name).join(', ')}`,
      },
    }, 400)
  }

  const insertSQL = `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`
  const optionStmts = buildSelectOptionStmts(c.env.DB, tableName, fieldMeta, [body])

  try {
    const results = await c.env.DB.batch([
      c.env.DB.prepare(insertSQL).bind(...values),
      c.env.DB.prepare(
        `INSERT INTO _meta (table_name, row_count) VALUES (?, 1)
         ON CONFLICT(table_name) DO UPDATE SET row_count = row_count + 1, updated_at = unixepoch()`
      ).bind(tableName),
      ...optionStmts,
    ])

    const insertResult = results[0] as D1Result
    const newId = insertResult.meta?.last_row_id

    // Construct response from input data + generated id (avoids extra SELECT)
    const newRow: Record<string, unknown> = { id: newId }
    for (const f of fields) {
      newRow[f] = body[f]
    }

    return c.json({ data: newRow }, 201)
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('NOT NULL constraint')) {
      const col = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/)?.[1]
      return c.json({
        error: { code: 'REQUIRED_FIELDS_MISSING', message: `Field "${col ?? 'unknown'}" is required` },
      }, 400)
    }
    throw err // 其他错误继续抛出
  }
})

/**
 * PATCH /api/tables/:tableName/records/:id
 * 更新记录（只更新请求体中提供的字段）
 * D1 成本：1行写入
 */
records.patch('/:tableName/records/:id', requireWriteMiddleware, async (c) => {
  const { tableName, id } = c.req.param()

  const [allTables, cols, fieldMeta] = await Promise.all([
    getUserTables(c.env.DB),
    getTableColumns(c.env.DB, tableName),
    getFieldMeta(c.env.DB, tableName),
  ])

  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  const writableCols = cols.filter((c) => c.pk === 0)
  const allowedNames = writableCols.map((c) => c.name)

  const body = await c.req.json<Record<string, unknown>>()
  const fields = Object.keys(body).filter((k) => allowedNames.includes(k))

  if (fields.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided in request body' } }, 400)
  }

  const setClause = fields.map((f) => `"${f}" = ?`).join(', ')
  const values = [...fields.map((f) => body[f]), id]
  const optionStmts = buildSelectOptionStmts(c.env.DB, tableName, fieldMeta, [body])

  const updateStmt = c.env.DB
    .prepare(`UPDATE "${tableName}" SET ${setClause} WHERE id = ?`)
    .bind(...values)

  const results = await c.env.DB.batch([updateStmt, ...optionStmts])
  const updateResult = results[0] as D1Result

  if (updateResult.meta.changes === 0) {
    return c.json({ error: { code: 'RECORD_NOT_FOUND', message: 'Record not found' } }, 404)
  }

  return c.json({ data: { success: true, id: Number(id) } })
})

/**
 * DELETE /api/tables/:tableName/records/:id
 * 删除记录
 * D1 成本：1行写入 + 1行写入（计数更新）
 */
records.delete('/:tableName/records/:id', requireWriteMiddleware, async (c) => {
  const { tableName, id } = c.req.param()

  const allTables = await getUserTables(c.env.DB)
  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  // 获取完整记录用于存入回收站
  const existing = await c.env.DB
    .prepare(`SELECT * FROM "${tableName}" WHERE id = ? LIMIT 1`)
    .bind(id)
    .first()

  if (!existing) {
    return c.json({ error: { code: 'RECORD_NOT_FOUND', message: 'Record not found' } }, 404)
  }

  await c.env.DB.batch([
    // 存入回收站
    c.env.DB.prepare(
      `INSERT INTO _trash (table_name, record_id, record_data, owner_id) VALUES (?, ?, ?, ?)`
    ).bind(tableName, id, JSON.stringify(existing), c.get('userId') ?? null),
    // 从原表删除
    c.env.DB.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).bind(id),
    c.env.DB.prepare(
      `UPDATE _meta SET row_count = MAX(row_count - 1, 0), updated_at = unixepoch() WHERE table_name = ?`
    ).bind(tableName),
  ])

  return c.json({ data: { success: true } })
})

/**
 * POST /api/tables/:tableName/records/batch
 * 批量新增（最多 500 条）
 * D1 成本：使用 db.batch()，N 条 = N 行写入，但只消耗 1 次请求往返
 */
records.post('/:tableName/records/batch', requireWriteMiddleware, async (c) => {
  const { tableName } = c.req.param()

  const [allTables, cols, fieldMeta] = await Promise.all([
    getUserTables(c.env.DB),
    getTableColumns(c.env.DB, tableName),
    getFieldMeta(c.env.DB, tableName),
  ])

  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }
  const writableCols = cols.filter((c) => c.pk === 0)
  const allowedNames = writableCols.map((c) => c.name)

  const body = await c.req.json<{ records: Record<string, unknown>[] }>()
  if (!Array.isArray(body.records) || body.records.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'records array cannot be empty' } }, 400)
  }

  const rows = body.records.slice(0, 500) // 单次最多 500 条

  // 从第一条记录推断字段列表
  const firstRow = rows[0]
  const fields = Object.keys(firstRow).filter((k) => allowedNames.includes(k))
  if (fields.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  const placeholders = fields.map(() => '?').join(', ')
  const columnList = fields.map((f) => `"${f}"`).join(', ')
  const insertSQL = `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`

  const stmts = rows.map((row) =>
    c.env.DB.prepare(insertSQL).bind(...fields.map((f) => row[f]))
  )

  // 追加计数更新
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO _meta (table_name, row_count) VALUES (?, ?)
       ON CONFLICT(table_name) DO UPDATE SET row_count = row_count + ?, updated_at = unixepoch()`
    ).bind(tableName, rows.length, rows.length)
  )

  // 自动补全 select 选项（跨所有行收集新值，每个字段只生成一条更新语句）
  stmts.push(...buildSelectOptionStmts(c.env.DB, tableName, fieldMeta, rows))

  await c.env.DB.batch(stmts)

  return c.json({ data: { inserted: rows.length } }, 201)
})

/**
 * GET /api/tables/:tableName/export
 *
 * 导出整张表数据（遵循当前筛选/排序）
 *   format=csv   → UTF-8 BOM CSV（默认，Excel 兼容）
 *   format=json  → JSON 数组
 *   filter/sort  → 同 records 接口
 *   最多导出 10000 行
 */
records.get('/:tableName/export', async (c) => {
  const { tableName } = c.req.param()
  const query = c.req.query()

  const [allTables, cols, fieldMeta] = await Promise.all([
    getUserTables(c.env.DB),
    getTableColumns(c.env.DB, tableName),
    getFieldMeta(c.env.DB, tableName),
  ])

  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  const allColumns = cols.map((col) => col.name)
  const filters = parseFilters(query, allColumns)

  let sort: { field: string; dir: 'ASC' | 'DESC' } | undefined
  if (query.sort) {
    const [field, dir] = query.sort.split(':')
    if (field && allColumns.includes(field)) {
      sort = { field, dir: dir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' }
    }
  }

  const { sql, params } = buildSelectSQL({
    tableName,
    selectFields: [],
    filters,
    sort,
    pageSize: 10000,
    skipPageSizeLimit: true,
  })

  const result = await c.env.DB.prepare(sql).bind(...params).all()
  const rows = result.results as Record<string, unknown>[]
  const formattedRows = formatDatetimeFields(rows, fieldMeta)

  // getFieldMeta 已按 order_index ASC 返回（含 id / created_at 等系统列）
  // 兜底：如果 _field_meta 为空（表未初始化），用 allColumns 作为 fallback
  const orderedFields = fieldMeta.length > 0
    ? fieldMeta
    : allColumns.map(c => ({ column_name: c, title: c }))

  const format = query.format === 'json' ? 'json' : 'csv'
  const safeFilename = tableName.replace(/[^a-z0-9_-]/gi, '_')

  if (format === 'json') {
    // JSON：使用 column_name 作为 key
    const json = JSON.stringify(formattedRows, null, 2)
    return new Response(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename}.json"`,
      },
    })
  }

  // CSV：用 field title 作为表头，保持字段顺序
  function csvEscape(v: unknown): string {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const columnNames = orderedFields.map(f => f.column_name)
  const headerRow = orderedFields.map(f => csvEscape(f.title)).join(',')
  const dataRows = formattedRows.map(row =>
    columnNames.map(col => csvEscape(row[col])).join(',')
  )
  const csv = '\uFEFF' + [headerRow, ...dataRows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFilename}.csv"`,
    },
  })
})

/**
 * 将 datetime/date 字段的 Unix 时间戳格式化为 ISO 8601 字符串
 * datetime: "2026-03-15T04:37:31Z" (UTC)
 * date: "2026-03-15"
 */
function formatDatetimeFields(
  rows: Record<string, unknown>[],
  fieldMeta: Array<{ column_name: string; field_type: string }>
): Record<string, unknown>[] {
  const dtCols = fieldMeta.filter(f => f.field_type === 'datetime').map(f => f.column_name)
  const dateCols = fieldMeta.filter(f => f.field_type === 'date').map(f => f.column_name)

  if (dtCols.length === 0 && dateCols.length === 0) return rows

  return rows.map(row => {
    const out = { ...row }
    for (const col of dtCols) {
      const v = out[col]
      if (v == null) continue
      const n = Number(v)
      if (!isNaN(n) && n > 0) {
        out[col] = new Date(n < 1e10 ? n * 1000 : n).toISOString()
      }
    }
    for (const col of dateCols) {
      const v = out[col]
      if (v == null) continue
      // 已经是 YYYY-MM-DD 字符串则保留
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) continue
      const n = Number(v)
      if (!isNaN(n) && n > 0) {
        out[col] = new Date(n < 1e10 ? n * 1000 : n).toISOString().slice(0, 10)
      }
    }
    return out
  })
}

export default records
