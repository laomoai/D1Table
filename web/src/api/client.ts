import axios from 'axios'

export const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true,
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    // 401: 未登录，跳转登录页
    if (err.response?.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    const msg = err.response?.data?.error?.message ?? err.message
    return Promise.reject(new Error(msg))
  }
)

// ── 类型定义 ──────────────────────────────────────────────────

export type FieldType = 'text' | 'longtext' | 'number' | 'currency' | 'percent' | 'email' | 'url' | 'date' | 'datetime' | 'checkbox' | 'select'

export interface SelectOption {
  value: string
  label: string
  color: string
}

export interface FieldMeta {
  column_name: string
  title: string
  field_type: FieldType
  select_options: SelectOption[] | null
  order_index: number
  width: number
  is_hidden: boolean
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
  sqliteType: string
}

export interface GroupInfo {
  id: number
  name: string
}

export interface TableMeta {
  name: string
  title: string | null
  row_count: number | null
  groups: GroupInfo[]
}

export interface Group {
  id: number
  name: string
  sort_order: number
  created_at: number
  tables: string[]
}

export interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
}

export interface RecordRow {
  id: number
  [key: string]: unknown
}

export interface PageResult {
  data: RecordRow[]
  meta: {
    page_size: number
    count: number
    next_cursor: string | null
  }
}

export interface RecordQuery {
  page_size?: number
  cursor?: string
  sort?: string          // 格式：field:asc
  fields?: string
  [key: string]: string | number | undefined  // filter[field]=value
}

// ── API 方法 ──────────────────────────────────────────────────

export const api = {
  /** 获取所有表 */
  getTables: () =>
    http.get<{ data: TableMeta[] }>('/tables').then((r) => r.data.data),

  /** 获取表结构 */
  getTableSchema: (tableName: string) =>
    http.get<{ data: { name: string; columns: ColumnDef[] } }>(`/tables/${tableName}`).then((r) => r.data.data),

  /** 查询记录（分页） */
  getRecords: (tableName: string, query: RecordQuery = {}) =>
    http.get<PageResult>(`/tables/${tableName}/records`, { params: query }).then((r) => r.data),

  /** 查询单条记录 */
  getRecord: (tableName: string, id: number) =>
    http.get<{ data: RecordRow }>(`/tables/${tableName}/records/${id}`).then((r) => r.data.data),

  /** 新增记录 */
  createRecord: (tableName: string, data: Record<string, unknown>) =>
    http.post<{ data: RecordRow }>(`/tables/${tableName}/records`, data).then((r) => r.data.data),

  /** 更新记录 */
  updateRecord: (tableName: string, id: number, data: Record<string, unknown>) =>
    http.patch<{ data: { success: boolean; id: number } }>(`/tables/${tableName}/records/${id}`, data).then((r) => r.data.data),

  /** 删除记录 */
  deleteRecord: (tableName: string, id: number) =>
    http.delete(`/tables/${tableName}/records/${id}`),

  /** 字段元数据 */
  getFieldMeta: (tableName: string) =>
    http.get<{ data: FieldMeta[] }>(`/tables/${tableName}/fields`).then((r) => r.data.data),

  updateFieldMeta: (tableName: string, colName: string, patch: Partial<Pick<FieldMeta, 'title' | 'field_type' | 'select_options' | 'width' | 'is_hidden' | 'order_index'>>) =>
    http.patch<{ data: { success: boolean } }>(`/tables/${tableName}/fields/${colName}`, patch).then((r) => r.data.data),

  addField: (tableName: string, data: { title: string; column_name?: string; field_type: FieldType; nullable?: boolean; default_value?: string; select_options?: SelectOption[] }) =>
    http.post<{ data: { column_name: string; title: string; field_type: string } }>(`/tables/${tableName}/fields`, data).then((r) => r.data.data),

  deleteField: (tableName: string, colName: string) =>
    http.delete(`/tables/${tableName}/fields/${colName}`),

  /** 更新表显示名 */
  updateTableTitle: (tableName: string, title: string) =>
    http.patch<{ data: { success: boolean } }>(`/tables/${tableName}`, { title }).then((r) => r.data.data),

  /** 删除表 */
  deleteTable: (tableName: string) =>
    http.delete(`/tables/${tableName}`),

  /** API Key 管理 */
  getKeys: () =>
    http.get<{ data: ApiKeyInfo[] }>('/admin/keys').then((r) => r.data.data),
  createKey: (data: { name: string; type: 'readonly' | 'readwrite'; scope?: 'all' | 'groups'; group_ids?: number[] }) =>
    http.post<{ data: { key: string; key_prefix: string; name: string; type: string; scope: string; group_ids: number[] } }>('/admin/keys', data).then((r) => r.data),
  updateKey: (id: number, data: { scope?: 'all' | 'groups'; group_ids?: number[] }) =>
    http.patch<{ data: { success: boolean } }>(`/admin/keys/${id}`, data).then((r) => r.data.data),
  revokeKey: (id: number) =>
    http.delete(`/admin/keys/${id}`),

  /** 回收站 */
  getTrash: () =>
    http.get<{ data: TrashItem[] }>('/trash').then((r) => r.data.data),
  restoreTrash: (id: number) =>
    http.post<{ data: { success: boolean } }>(`/trash/${id}/restore`).then((r) => r.data.data),
  deleteTrash: (id: number) =>
    http.delete(`/trash/${id}`),
  emptyTrash: () =>
    http.delete('/trash'),

  /** 分组管理 */
  getGroups: () =>
    http.get<{ data: Group[] }>('/groups').then((r) => r.data.data),
  createGroup: (name: string, sort_order?: number) =>
    http.post<{ data: { id: number; name: string } }>('/groups', { name, sort_order }).then((r) => r.data.data),
  updateGroup: (id: number, data: { name?: string; sort_order?: number }) =>
    http.patch<{ data: { success: boolean } }>(`/groups/${id}`, data).then((r) => r.data.data),
  deleteGroup: (id: number) =>
    http.delete(`/groups/${id}`),
  setGroupTables: (id: number, tables: string[]) =>
    http.put<{ data: { success: boolean } }>(`/groups/${id}/tables`, { tables }).then((r) => r.data.data),
}

export interface TrashItem {
  id: number
  table_name: string
  record_id: number
  record_data: Record<string, unknown>
  deleted_at: string
  expires_at: string
}

export interface ApiKeyInfo {
  id: number
  key_prefix: string
  name: string
  type: 'readonly' | 'readwrite'
  scope: 'all' | 'groups'
  created_at: number
  is_active: number
  groups: GroupInfo[]
}

export const getCurrentUser = (): Promise<{ email: string; name: string; picture: string }> =>
  http.get<{ data: { email: string; name: string; picture: string } }>('/auth/me')
    .then(r => r.data.data)
