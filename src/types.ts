export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  ENVIRONMENT: string
  ADMIN_KEY?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ALLOWED_EMAILS: string  // 逗号分隔的邮箱列表
}

export type SessionUser = {
  email: string
  name: string
  picture: string
}

export type ColumnInfo = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export type ApiKeyRow = {
  id: number
  key_prefix: string
  key_hash: string
  name: string
  type: 'readonly' | 'readwrite'
  created_at: number
  is_active: number
}

// 经过 auth 中间件后挂载到 context 上的变量
export type AuthVariables = {
  keyType: 'readonly' | 'readwrite'
  keyScope: 'all' | 'groups'
  allowedTables: string[] | null // null = all tables, string[] = restricted
  user?: SessionUser
}
