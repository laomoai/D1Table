import type { ColumnInfo } from '../types'

/**
 * 从 sqlite_master 获取所有用户表名（排除 _ 开头的系统表）
 * 注意：D1 查询是 I/O，不计入 CPU time，但计入行读取。
 * sqlite_master 通常行数极少（几十行），成本可忽略。
 */
export async function getUserTables(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY rowid`
    )
    .all<{ name: string }>()
  // 在 JS 层过滤系统表：_ 开头、sqlite_ 开头、_cf_ 开头
  return result.results
    .map((r) => r.name)
    .filter(
      (name) =>
        !name.startsWith('_') &&
        !name.startsWith('sqlite_') &&
        !name.startsWith('d1_')
    )
}

/**
 * 通过 PRAGMA table_info 获取表的列信息
 * 每次调用读取很少行（列数），成本极低
 */
export async function getTableColumns(
  db: D1Database,
  tableName: string
): Promise<ColumnInfo[]> {
  const result = await db
    .prepare(`PRAGMA table_info("${sanitizeName(tableName)}")`)
    .all<ColumnInfo>()
  return result.results
}

/**
 * 验证表名是否存在于用户表列表中
 * 防止访问系统表或不存在的表
 */
export async function validateTableName(
  db: D1Database,
  tableName: string
): Promise<boolean> {
  if (!isValidIdentifier(tableName)) return false
  const tables = await getUserTables(db)
  return tables.includes(tableName)
}

/**
 * 标识符只允许字母、数字、下划线，且不能以数字开头
 * 防止 SQL 注入（表名、列名）
 */
export function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 64
}

/** 清理标识符，与 isValidIdentifier 配合使用 */
export function sanitizeName(name: string): string {
  if (!isValidIdentifier(name)) {
    throw new Error(`非法标识符: ${name}`)
  }
  return name
}
