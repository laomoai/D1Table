export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  BUCKET: R2Bucket
  ENVIRONMENT: string
  ADMIN_KEY?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  ALLOWED_EMAILS: string  // 仅用于引导首个 admin，之后通过 _users 表管理
}

export type SessionUser = {
  email: string
  name: string
  picture: string
}

export type UserRow = {
  id: number
  email: string
  name: string
  picture: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  created_at: number
  last_login: number | null
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
  userId?: number               // _users.id，ADMIN_KEY 时为 undefined
  userRole?: 'admin' | 'user'   // _users.role
}
