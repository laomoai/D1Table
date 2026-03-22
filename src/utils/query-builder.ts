import { sanitizeName } from './schema-cache'

export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'nlike'

export interface FilterItem {
  field: string   // 已通过白名单校验
  op: FilterOp
  value: string
}

const OP_SQL: Record<FilterOp, string> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  nlike: 'NOT LIKE',
}

export interface SelectOptions {
  tableName: string       // 已校验
  selectFields: string[]  // 已校验列名，空数组 = *
  filters: FilterItem[]
  sort?: { field: string; dir: 'ASC' | 'DESC' }
  cursor?: number         // 上一页最后一条 id（keyset 分页）
  pageSize: number        // 最大 100（除非 skipPageSizeLimit = true）
  offset?: number         // offset 分页（page > 1 时使用）
  skipPageSizeLimit?: boolean  // 导出等场景允许超过 100 行
}

/**
 * 构建 SELECT 语句和参数数组
 *
 * 分页策略：
 * - 默认或 ORDER BY id：keyset 分页 (WHERE id > :cursor)，成本 = pageSize 行
 * - 自定义排序：同样追加 id 作为次级排序保证顺序一致性
 *   cursor 仍然是 id，借助 (sort_val, id) 元组判断是否超出上页末尾
 *   简化版：cursor 基于 id，sort 字段做 ORDER BY，结果一致但在极端数据下
 *   游标前几行可能被跳过；对管理工具足够用，大规模生产可升级为复合游标
 *
 * 为何不用 OFFSET：OFFSET N 需扫描前 N 行，大页码时消耗 D1 行读取额度
 */
export function buildSelectSQL(opts: SelectOptions): {
  sql: string
  params: (string | number)[]
} {
  const { tableName, selectFields, filters, sort, cursor, pageSize, offset } = opts

  // cursor 和 offset 互斥：cursor 用于 keyset 分页，offset 用于页码分页
  if (cursor !== undefined && offset !== undefined && offset > 0) {
    throw new Error('Cannot use both cursor and offset pagination')
  }

  const safeTable = sanitizeName(tableName)
  const fields =
    selectFields.length > 0
      ? selectFields.map((f) => `"${sanitizeName(f)}"`).join(', ')
      : '*'

  const conditions: string[] = []
  const params: (string | number)[] = []

  // Keyset 分页条件（默认 id DESC，所以 cursor 取 < ）
  if (cursor !== undefined) {
    conditions.push('"id" < ?')
    params.push(cursor)
  }

  // 用户筛选条件
  for (const f of filters) {
    const col = `"${sanitizeName(f.field)}"`
    const opSql = OP_SQL[f.op]
    if (f.op === 'like' || f.op === 'nlike') {
      conditions.push(`${col} ${opSql} ?`)
      params.push(`%${f.value}%`)
    } else {
      conditions.push(`${col} ${opSql} ?`)
      params.push(f.value)
    }
  }

  let sql = `SELECT ${fields} FROM "${safeTable}"`
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`
  }

  // 排序：自定义字段 + id 兜底，保证游标稳定
  if (sort && sort.field !== 'id') {
    const safeField = sanitizeName(sort.field)
    sql += ` ORDER BY "${safeField}" ${sort.dir}, "id" DESC`
  } else if (sort && sort.field === 'id') {
    sql += ` ORDER BY "id" ${sort.dir}`
  } else {
    sql += ` ORDER BY "id" DESC`
  }

  // 限制 pageSize 上限，防止单次大量读取（导出场景除外）
  const size = opts.skipPageSizeLimit ? pageSize : Math.min(pageSize, 100)
  sql += ` LIMIT ?`
  params.push(size)

  if (offset !== undefined && offset > 0) {
    sql += ` OFFSET ?`
    params.push(offset)
  }

  return { sql, params }
}

/** 解析请求中的 filter 参数
 *  支持格式：
 *    filter[field]=value         → eq
 *    filter[field__gt]=value     → gt
 *    filter[field__like]=value   → like
 */
export function parseFilters(
  query: Record<string, string>,
  allowedColumns: string[]
): FilterItem[] {
  const allowed = new Set(allowedColumns)
  const items: FilterItem[] = []

  for (const [key, value] of Object.entries(query)) {
    const match = key.match(/^filter\[([^\]]+)\]$/)
    if (!match) continue

    const raw = match[1]
    const sepIdx = raw.lastIndexOf('__')
    let field: string
    let op: FilterOp

    if (sepIdx > 0) {
      field = raw.slice(0, sepIdx)
      const opStr = raw.slice(sepIdx + 2) as FilterOp
      if (!(opStr in OP_SQL)) continue // 非法操作符忽略
      op = opStr
    } else {
      field = raw
      op = 'eq'
    }

    if (!allowed.has(field)) continue // 非允许列忽略，防止注入
    if (value === undefined || value === '') continue

    items.push({ field, op, value })
  }

  return items
}
