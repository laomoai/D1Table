import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { getUserTables, isValidIdentifier } from '../utils/schema-cache'

const fields = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

const SELECT_COLORS = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']

/** 为缺少 color 的 select option 自动补色 */
function ensureOptionColors(opts: Array<{ id?: string; value: string; label: string; color?: string }>): Array<{ id?: string; value: string; label: string; color: string }> {
  return opts.map((o, i) => ({
    ...o,
    color: o.color?.trim() ? o.color : SELECT_COLORS[i % SELECT_COLORS.length],
  }))
}

// SQLite 类型 → 默认 field_type 映射
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

// 确保 _field_meta 存在（懒初始化，支持通过其他方式创建的表）
async function ensureFieldMeta(db: D1Database, tableName: string) {
  const cols = await db.prepare(`PRAGMA table_info("${tableName}")`).all<{
    cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number
  }>()

  if (cols.results.length === 0) return []

  const existing = await db.prepare(
    `SELECT column_name FROM _field_meta WHERE table_name = ?`
  ).bind(tableName).all<{ column_name: string }>()

  const existingSet = new Set(existing.results.map(r => r.column_name))

  const toInsert = cols.results.filter(c => !existingSet.has(c.name))
  if (toInsert.length > 0) {
    const stmts = toInsert.map((c, i) =>
      db.prepare(
        `INSERT OR IGNORE INTO _field_meta (table_name, column_name, title, field_type, order_index, width, is_hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        tableName,
        c.name,
        c.name,
        inferFieldType(c.name, c.type),
        (existing.results.length + i) * 10,
        c.name === 'id' ? 80 : 180,
        c.name === 'created_at' ? 1 : 0
      )
    )
    await db.batch(stmts)
  }

  // 返回合并结果, reuse the PRAGMA result to avoid a duplicate call
  return getMergedFields(db, tableName, cols)
}

type PragmaResult = D1Result<{
  cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number
}>

async function getMergedFields(db: D1Database, tableName: string, existingPragma?: PragmaResult) {
  const [pragma, meta] = await Promise.all([
    existingPragma ?? db.prepare(`PRAGMA table_info("${tableName}")`).all<{
      cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number
    }>(),
    db.prepare(
      `SELECT * FROM _field_meta WHERE table_name = ? ORDER BY order_index ASC`
    ).bind(tableName).all<{
      id: number; column_name: string; title: string; field_type: string;
      select_options: string | null; order_index: number; width: number; is_hidden: number
    }>()
  ])

  const metaMap = Object.fromEntries(meta.results.map(m => [m.column_name, m]))

  // 按 meta order_index 排序，没有 meta 的列放最后
  const allCols = pragma.results.map(c => {
    const m = metaMap[c.name]
    return {
      column_name: c.name,
      title: m?.title ?? c.name,
      field_type: m?.field_type ?? inferFieldType(c.name, c.type),
      select_options: m?.select_options ? JSON.parse(m.select_options) : null,
      order_index: m?.order_index ?? 999,
      width: m?.width ?? 180,
      is_hidden: (m?.is_hidden ?? 0) === 1,
      nullable: c.notnull === 0,
      isPrimaryKey: c.pk > 0,
      defaultValue: c.dflt_value,
      sqliteType: c.type,
    }
  })

  allCols.sort((a, b) => a.order_index - b.order_index)
  return allCols
}

/**
 * GET /api/tables/:tableName/fields
 * 返回字段元数据（含 title、type、visibility 等）
 * 前端用这个驱动整个 UI，不再直接用 PRAGMA
 */
fields.get('/:tableName/fields', async (c) => {
  const { tableName } = c.req.param()
  const allTables = await getUserTables(c.env.DB)
  if (!allTables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found` } }, 404)
  }

  const result = await ensureFieldMeta(c.env.DB, tableName)
  return c.json({ data: result })
})

/**
 * PATCH /api/tables/:tableName/fields/:colName
 * 更新字段元数据（title、type、width、hidden、order）
 * 不修改数据库 schema，只改展示层
 */
fields.patch('/:tableName/fields/:colName', requireWriteMiddleware, async (c) => {
  const { tableName, colName } = c.req.param()

  if (!isValidIdentifier(tableName) || !isValidIdentifier(colName)) {
    return c.json({ error: { code: 'INVALID_NAME', message: 'Invalid table or column name' } }, 400)
  }


  const body = await c.req.json<{
    title?: string
    field_type?: string
    select_options?: Array<{ id?: string; value: string; label: string; color: string }>
    width?: number
    is_hidden?: boolean
    order_index?: number
  }>()

  const updates: string[] = []
  const params: unknown[] = []

  if (body.title !== undefined) { updates.push('title = ?'); params.push(body.title) }
  if (body.field_type !== undefined) { updates.push('field_type = ?'); params.push(body.field_type) }
  if (body.select_options !== undefined) { updates.push('select_options = ?'); params.push(JSON.stringify(ensureOptionColors(body.select_options))) }
  if (body.width !== undefined) { updates.push('width = ?'); params.push(body.width) }
  if (body.is_hidden !== undefined) { updates.push('is_hidden = ?'); params.push(body.is_hidden ? 1 : 0) }
  if (body.order_index !== undefined) { updates.push('order_index = ?'); params.push(body.order_index) }

  if (updates.length === 0) {
    return c.json({ error: { code: 'NO_CHANGES', message: 'No fields to update' } }, 400)
  }

  // 如果 select_options 有变化，通过稳定 ID 匹配新旧选项，找出 value 被重命名的项
  const valueRenames: Array<{ oldVal: string; newVal: string }> = []
  if (body.select_options !== undefined) {
    const oldMeta = await c.env.DB.prepare(
      `SELECT select_options FROM _field_meta WHERE table_name = ? AND column_name = ?`
    ).bind(tableName, colName).first<{ select_options: string | null }>()

    if (oldMeta?.select_options) {
      const oldOpts = JSON.parse(oldMeta.select_options) as Array<{ id?: string; value: string; label: string }>
      const oldById = new Map(oldOpts.filter(o => o.id).map(o => [o.id!, o]))

      for (const newOpt of body.select_options) {
        if (!newOpt.id) continue
        const oldOpt = oldById.get(newOpt.id)
        if (oldOpt && oldOpt.value && newOpt.value && oldOpt.value !== newOpt.value) {
          valueRenames.push({ oldVal: oldOpt.value, newVal: newOpt.value })
        }
      }
    }
  }

  params.push(tableName, colName)

  // 构建批量语句：meta 更新 + 数据行值迁移放进同一个 batch 保证原子性
  const stmts: D1PreparedStatement[] = []

  stmts.push(
    c.env.DB.prepare(
      `UPDATE _field_meta SET ${updates.join(', ')} WHERE table_name = ? AND column_name = ?`
    ).bind(...params)
  )

  // 用单条 CASE WHEN 合并所有重命名，避免链式碰撞（A→B, B→C 不会导致 A→C）
  if (valueRenames.length > 0) {
    const whenClauses = valueRenames.map(() => `WHEN "${colName}" = ? THEN ?`).join(' ')
    const whereIn = valueRenames.map(() => '?').join(', ')
    const caseParams: string[] = []
    const whereParams: string[] = []
    for (const { oldVal, newVal } of valueRenames) {
      caseParams.push(oldVal, newVal)
      whereParams.push(oldVal)
    }
    stmts.push(
      c.env.DB.prepare(
        `UPDATE "${tableName}" SET "${colName}" = CASE ${whenClauses} ELSE "${colName}" END WHERE "${colName}" IN (${whereIn})`
      ).bind(...caseParams, ...whereParams)
    )
  }

  const results = await c.env.DB.batch(stmts)

  if (results[0].meta.changes === 0) {
    // 可能是懒初始化的字段，先 ensure 再 update
    await ensureFieldMeta(c.env.DB, tableName)
    await c.env.DB.prepare(
      `UPDATE _field_meta SET ${updates.join(', ')} WHERE table_name = ? AND column_name = ?`
    ).bind(...params).run()
  }

  return c.json({ data: { success: true } })
})

/**
 * POST /api/tables/:tableName/fields
 * 添加字段（ALTER TABLE + 写 _field_meta）
 */
fields.post('/:tableName/fields', requireWriteMiddleware, async (c) => {
  const { tableName } = c.req.param()


  const body = await c.req.json<{
    title: string
    column_name?: string
    field_type: string
    nullable?: boolean
    default_value?: string
    select_options?: Array<{ value: string; label: string; color: string }>
  }>()

  if (!body.title?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Field display name cannot be empty' } }, 400)
  }

  // 自动生成 column_name（从 title 转换）
  let columnName = body.column_name?.trim() ?? ''
  if (!columnName) {
    const derived = body.title.toLowerCase()
      .replace(/[^\w\s]/g, '')   // 去掉非 ASCII 字符（含中文）
      .replace(/\s+/g, '_')
      .replace(/^[0-9]/, '_$&')
      .replace(/^_+|_+$/g, '')   // 去掉首尾下划线
      .slice(0, 32)
    // 如果 title 全是中文等非 ASCII，derived 为空，用随机短码兜底
    columnName = isValidIdentifier(derived) ? derived : `field_${Date.now().toString(36)}`
  }

  if (!isValidIdentifier(columnName)) {
    return c.json({ error: { code: 'INVALID_NAME', message: `Cannot generate a valid field name from "${body.title}"` } }, 400)
  }

  // fieldType → SQLite type
  const sqliteTypeMap: Record<string, string> = {
    text: 'TEXT', longtext: 'TEXT', email: 'TEXT', url: 'TEXT', select: 'TEXT',
    number: 'REAL', currency: 'REAL', percent: 'REAL',
    date: 'TEXT', datetime: 'TEXT',
    checkbox: 'INTEGER',
  }
  const sqliteType = sqliteTypeMap[body.field_type] ?? 'TEXT'
  const nullable = body.nullable !== false
  const defVal = body.default_value ? ` DEFAULT ${body.default_value}` : (nullable ? '' : " DEFAULT ''")

  // 获取当前最大 order_index
  const maxOrder = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(order_index), 0) as max_order FROM _field_meta WHERE table_name = ?`
  ).bind(tableName).first<{ max_order: number }>()

  const alterSQL = `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${sqliteType}${nullable ? '' : ' NOT NULL'}${defVal}`

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(alterSQL),
      c.env.DB.prepare(
        `INSERT INTO _field_meta (table_name, column_name, title, field_type, select_options, order_index, width)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        tableName, columnName, body.title.trim(), body.field_type,
        body.select_options ? JSON.stringify(ensureOptionColors(body.select_options)) : null,
        (maxOrder?.max_order ?? 0) + 10, 180
      )
    ])
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('duplicate column')) {
      return c.json({ error: { code: 'FIELD_EXISTS', message: `Field "${columnName}" already exists` } }, 409)
    }
    throw err
  }

  return c.json({ data: { column_name: columnName, title: body.title.trim(), field_type: body.field_type } }, 201)
})

/**
 * DELETE /api/tables/:tableName/fields/:colName
 * 删除字段（SQLite 不支持 DROP COLUMN 直接删除，需要重建表）
 * 简化版：只隐藏字段（is_hidden=1），不真正删除列
 * 如果要真正删除，需要重建整张表，成本高
 */
fields.delete('/:tableName/fields/:colName', requireWriteMiddleware, async (c) => {
  const { tableName, colName } = c.req.param()


  // 检查是否为系统列
  if (['id', 'created_at'].includes(colName)) {
    return c.json({ error: { code: 'SYSTEM_FIELD', message: 'Cannot delete system fields' } }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE _field_meta SET is_hidden = 1 WHERE table_name = ? AND column_name = ?`
  ).bind(tableName, colName).run()

  return c.json({ data: { success: true } })
})

/**
 * 只读版字段元数据查询：单次查询，不做懒初始化
 * 在读路径（GET /records）使用，避免 ensureFieldMeta 的额外 PRAGMA + INSERT 开销
 */
export async function getFieldMeta(db: D1Database, tableName: string): Promise<Array<{
  column_name: string; title: string; field_type: string; select_options: unknown[] | null
}>> {
  const rows = await db.prepare(
    `SELECT column_name, title, field_type, select_options FROM _field_meta WHERE table_name = ? ORDER BY order_index ASC`
  ).bind(tableName).all<{ column_name: string; title: string; field_type: string; select_options: string | null }>()

  return rows.results.map(r => ({
    column_name: r.column_name,
    title: r.title,
    field_type: r.field_type,
    select_options: r.select_options ? JSON.parse(r.select_options) : null,
  }))
}

export { ensureFieldMeta, getMergedFields }
export default fields
