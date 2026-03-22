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

export type FieldType = 'text' | 'longtext' | 'number' | 'currency' | 'percent' | 'email' | 'url' | 'date' | 'datetime' | 'checkbox' | 'select' | 'image' | 'note' | 'link'

export interface LinkValue {
  id: string
  title: string
}

export interface ImageValue {
  thumb: string    // R2 key，如 images/uuid/thumb.webp
  display: string  // R2 key，如 images/uuid/display.webp
  name: string     // 原始文件名
  size: number     // display 文件大小（字节）
}

export interface SelectOption {
  id?: string
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
  icon: string | null
  is_locked: boolean
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
  page?: number
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

  /** 导出表数据 */
  exportRecords: (tableName: string, params: Omit<RecordQuery, 'page' | 'page_size' | 'cursor'> & { format: 'csv' | 'json' }) =>
    http.get(`/tables/${tableName}/export`, { params, responseType: 'blob' }).then((r) => r.data as Blob),

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

  /** 搜索记录（用于 link 字段选择器）*/
  searchRecords: (tableName: string, q?: string, limit?: number) =>
    http.get<{ data: LinkValue[] }>(`/tables/${tableName}/records/search`, { params: { q, limit } }).then((r) => r.data.data),

  /** 字段元数据 */
  getFieldMeta: (tableName: string) =>
    http.get<{ data: FieldMeta[] }>(`/tables/${tableName}/fields`).then((r) => r.data.data),

  updateFieldMeta: (tableName: string, colName: string, patch: Partial<Pick<FieldMeta, 'title' | 'field_type' | 'select_options' | 'width' | 'is_hidden' | 'order_index'>>) =>
    http.patch<{ data: { success: boolean } }>(`/tables/${tableName}/fields/${colName}`, patch).then((r) => r.data.data),

  addField: (tableName: string, data: { title: string; column_name?: string; field_type: FieldType; nullable?: boolean; default_value?: string; select_options?: SelectOption[]; link_table?: string }) =>
    http.post<{ data: { column_name: string; title: string; field_type: string } }>(`/tables/${tableName}/fields`, data).then((r) => r.data.data),

  deleteField: (tableName: string, colName: string) =>
    http.delete(`/tables/${tableName}/fields/${colName}`),

  /** 更新表显示名 */
  updateTableTitle: (tableName: string, title: string) =>
    http.patch<{ data: { success: boolean } }>(`/tables/${tableName}`, { title }).then((r) => r.data.data),

  /** 更新表图标 */
  updateTableIcon: (tableName: string, icon: string | null) =>
    http.patch<{ data: { success: boolean } }>(`/tables/${tableName}`, { icon }).then((r) => r.data.data),

  /** 切换表锁定状态 */
  setTableLocked: (tableName: string, isLocked: boolean) =>
    http.patch<{ data: { success: boolean } }>(`/tables/${tableName}`, { is_locked: isLocked }).then((r) => r.data.data),

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

  /** 图片上传 */
  uploadImage: async (thumb: Blob, display: Blob, name: string): Promise<ImageValue> => {
    const form = new FormData()
    form.append('thumb', thumb, 'thumb.webp')
    form.append('display', display, 'display.webp')
    form.append('name', name)
    const res = await http.post<{ data: ImageValue }>('/upload/image', form)
    return res.data.data
  },

  deleteImage: (thumb: string, display: string): Promise<void> =>
    http.delete('/upload/image', { data: { thumb, display } }).then(() => {}),

  /** 回收站 */
  getTrash: () =>
    http.get<{ data: TrashItem[] }>('/trash').then((r) => r.data.data),
  restoreTrash: (id: number) =>
    http.post<{ data: { success: boolean } }>(`/trash/${id}/restore`).then((r) => r.data.data),
  deleteTrash: (id: number) =>
    http.delete(`/trash/${id}`),
  emptyTrash: () =>
    http.delete('/trash'),

  /** Dashboard 配置 */
  getDashboard: (tableName: string) =>
    http.get<{ data: { config: unknown[] } }>(`/tables/${tableName}/dashboard`).then(r => r.data.data.config),
  saveDashboard: (tableName: string, config: unknown[]) =>
    http.put<{ data: { success: boolean } }>(`/tables/${tableName}/dashboard`, { config }).then(r => r.data.data),

  /** 用户偏好设置 */
  getPreferences: () =>
    http.get<{ data: Record<string, unknown> }>('/user/preferences').then(r => r.data.data),
  savePreferences: (data: Record<string, unknown>) =>
    http.put<{ data: { success: boolean } }>('/user/preferences', data).then(r => r.data.data),

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
  last_used_at: number | null
  groups: GroupInfo[]
}

export interface CurrentUser {
  id: number
  email: string
  name: string
  picture: string
  role: 'admin' | 'user'
}

export interface UserInfo {
  id: number
  email: string
  name: string
  picture: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  created_at: number
  last_login: number | null
  table_count: number
}

// ── Notes 类型定义 ──────────────────────────────────────────────────

export interface Note {
  id: string
  title: string
  content: string
  icon: string | null
  parent_id: string | null
  sort_order: number
  is_locked: number
  created_by: number | null
  owner_id: number | null
  created_at: number
  updated_at: number
}

export type NoteListItem = Omit<Note, 'content' | 'owner_id'>

export interface NoteCreate {
  title?: string
  content?: string
  parent_id?: string
}

export interface NoteUpdate {
  title?: string
  content?: string
  icon?: string | null
  parent_id?: string | null
  sort_order?: number
  is_locked?: boolean
}

export const notesApi = {
  /** 获取笔记列表 */
  getNotes: (params?: { parent_id?: string }) =>
    http.get<{ data: NoteListItem[] }>('/notes', { params }).then(r => r.data.data),

  /** 获取笔记树（独立笔记） */
  getTree: () =>
    http.get<{ data: NoteListItem[] }>('/notes/tree').then(r => r.data.data),

  /** 获取单个笔记（含 content） */
  getNote: (id: string) =>
    http.get<{ data: Note }>(`/notes/${id}`).then(r => r.data.data),

  /** 创建笔记 */
  createNote: (data: NoteCreate) =>
    http.post<{ data: { id: string; title: string } }>('/notes', data).then(r => r.data.data),

  /** 更新笔记 */
  updateNote: (id: string, data: NoteUpdate) =>
    http.patch<{ data: { success: boolean } }>(`/notes/${id}`, data).then(r => r.data.data),

  /** 删除笔记（软删除） */
  deleteNote: (id: string) =>
    http.delete(`/notes/${id}`),

  /** 恢复已删除的笔记 */
  restoreNote: (id: string) =>
    http.post<{ data: { success: boolean } }>(`/notes/${id}/restore`).then(r => r.data.data),

  /** 获取已删除的笔记 */
  getTrash: () =>
    http.get<{ data: { id: string; title: string; icon: string | null; deleted_at: number }[] }>('/notes/trash').then(r => r.data.data),
}

export const getCurrentUser = (): Promise<CurrentUser> =>
  http.get<{ data: CurrentUser }>('/auth/me')
    .then(r => r.data.data)

export const userApi = {
  getUsers: () =>
    http.get<{ data: UserInfo[] }>('/admin/users').then(r => r.data.data),
  addUser: (data: { email: string; name?: string; role?: 'admin' | 'user' }) =>
    http.post<{ data: UserInfo }>('/admin/users', data).then(r => r.data.data),
  updateUser: (id: number, data: { role?: string; status?: string }) =>
    http.patch<{ data: { success: boolean } }>(`/admin/users/${id}`, data).then(r => r.data.data),
  disableUser: (id: number) =>
    http.delete(`/admin/users/${id}`),
}
