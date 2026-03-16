<template>
  <div class="grid-wrapper">
    <!-- 工具栏 -->
    <div class="toolbar">
      <span class="table-title">{{ displayTitle }}</span>
      <span v-if="totalCount !== null" class="row-count">{{ totalCount }} 条记录</span>
      <div style="flex:1" />
      <n-button size="small" @click="showFilterBar = !showFilterBar">
        筛选{{ activeFilters.length ? ` (${activeFilters.length})` : '' }}
      </n-button>
      <n-button size="small" @click="showFieldPanel = true">
        字段{{ hiddenCount ? ` (${hiddenCount} 隐藏)` : '' }}
      </n-button>
      <n-button size="small" quaternary @click="refreshAll" title="刷新" :disabled="refreshing">
        <span :class="{ 'spin-icon': refreshing }">↻</span>
      </n-button>
      <n-button size="small" type="primary" @click="openCreate">+ 新增</n-button>
    </div>

    <!-- 筛选栏 -->
    <FilterBar
      v-if="showFilterBar"
      :columns="filterColumns"
      @change="handleFilterChange"
    />

    <div class="ag-grid-box ag-theme-alpine">
      <AgGridVue
        style="width:100%;height:100%"
        :columnDefs="columnDefs"
        :rowData="rowData"
        :defaultColDef="defaultColDef"
        :getRowId="getRowId"
        :rowHeight="36"
        :headerHeight="38"
        :animateRows="false"
        :suppressCellFocus="true"
        :enableCellTextSelection="true"
        :ensureDomOrder="true"
        :suppressMovableColumns="true"
        @grid-ready="onGridReady"
        @column-resized="onColumnResized"
        @sort-changed="onSortChanged"
        @body-scroll="onBodyScroll"
      />
    </div>

    <!-- 底栏 -->
    <div class="grid-footer">
      <n-spin v-if="isFetchingNextPage || isLoading" size="small" />
      <span v-else-if="rowData.length === 0" class="footer-hint">暂无数据</span>
      <span v-else-if="!hasNextPage" class="footer-hint">
        已加载全部 {{ rowData.length }} 条
      </span>
      <span v-else class="footer-hint">已加载 {{ rowData.length }} 条，滚动加载更多</span>
    </div>
  </div>

  <!-- 新增/编辑弹窗 -->
  <RecordForm
    v-model:show="showForm"
    :fields="fields"
    :record="editingRecord"
    @submit="handleFormSubmit"
  />

  <!-- 字段管理面板 -->
  <FieldPanel
    v-model:show="showFieldPanel"
    :table-name="tableName"
    :fields="fields"
    @refresh="emit('refresh')"
  />

  <!-- 记录展开 -->
  <RowExpand
    v-if="expandRow !== null"
    v-model:show="showExpand"
    :table-name="tableName"
    :fields="fields"
    :all-rows="rowData as Record<string, unknown>[]"
    :initial-index="expandIndex"
    @refresh="invalidate"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, markRaw, shallowRef } from 'vue'
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query'
import { useMessage, useDialog, NButton, NSpin } from 'naive-ui'
import { AgGridVue } from 'ag-grid-vue3'
import type { ColDef, GridApi, ColumnResizedEvent, SortChangedEvent } from 'ag-grid-community'

import { api, type FieldMeta, type FieldType, type RecordRow, type SelectOption } from '@/api/client'
import FilterBar, { type Filter } from './FilterBar.vue'
import RecordForm from './RecordForm.vue'
import FieldPanel from './FieldPanel.vue'
import RowExpand from './RowExpand.vue'
import _FieldHeader from './grid/FieldHeader.vue'

const FieldHeader = markRaw(_FieldHeader)

const props = defineProps<{
  tableName: string
  fields: FieldMeta[]
  tableTitle?: string | null
  totalCount: number | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const message = useMessage()
const dialog = useDialog()
const queryClient = useQueryClient()

// ── 状态 ──────────────────────────────────────────────────────
const showFilterBar = ref(false)
const showForm = ref(false)
const showFieldPanel = ref(false)
const showExpand = ref(false)
const editingRecord = ref<RecordRow | null>(null)
const activeFilters = ref<Filter[]>([])
const expandRow = ref<Record<string, unknown> | null>(null)
const expandIndex = ref(0)
const gridApi = shallowRef<GridApi | null>(null)
const sortField = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
let resizeTimer: ReturnType<typeof setTimeout> | null = null

// ── 计算属性 ──────────────────────────────────────────────────
const visibleFields = computed(() =>
  props.fields
    .filter(f => !f.is_hidden)
    .sort((a, b) => a.order_index - b.order_index)
)
const hiddenCount = computed(() => props.fields.filter(f => f.is_hidden).length)
const displayTitle = computed(() => props.tableTitle || props.tableName)

const filterColumns = computed(() =>
  visibleFields.value.map(f => ({
    name: f.column_name,
    type: f.sqliteType || 'TEXT',
    nullable: f.nullable,
    isPrimaryKey: f.isPrimaryKey,
    defaultValue: f.defaultValue,
  }))
)

// ── 列定义（函数式 cell renderer，不用 Vue 组件，避免 Proxy 问题） ──
const defaultColDef: ColDef = { sortable: false, resizable: false }

const columnDefs = computed<ColDef[]>(() => {
  const cols: ColDef[] = []

  // 展开按钮列
  cols.push({
    colId: '__expand',
    headerName: '',
    width: 40,
    minWidth: 40,
    maxWidth: 40,
    sortable: false,
    resizable: false,
    cellRenderer: expandCellRenderer,
    cellClass: 'expand-cell',
  })

  // 数据列
  for (const field of visibleFields.value) {
    cols.push({
      colId: field.column_name,
      field: field.column_name,
      headerName: field.title,
      width: field.width,
      minWidth: 60,
      sortable: true,
      resizable: true,
      headerComponent: FieldHeader,
      headerComponentParams: {
        field,
        onRename: (title: string) => saveRename(field, title),
        onToggleHidden: () => toggleHidden(field),
        onDeleteField: () => deleteField(field),
      },
      cellRenderer: typedCellRenderer,
      cellRendererParams: {
        fieldType: field.field_type,
        selectOptions: field.select_options,
      },
    })
  }

  // 操作列
  cols.push({
    colId: '__actions',
    headerName: '操作',
    width: 110,
    minWidth: 110,
    maxWidth: 110,
    sortable: false,
    resizable: false,
    cellRenderer: actionsCellRenderer,
  })

  return cols
})

// ── 查询参数 ──────────────────────────────────────────────────
const queryParams = computed(() => {
  const params: Record<string, string> = { page_size: '50' }
  if (sortField.value) params.sort = `${sortField.value}:${sortDir.value}`
  for (const f of activeFilters.value) {
    if (f.field && f.value) {
      params[`filter[${f.field}${f.op === 'eq' ? '' : `__${f.op}`}]`] = f.value
    }
  }
  return params
})

// ── 数据查询 ─────────────────────────────────────────────────
const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
  useInfiniteQuery({
    queryKey: computed(() => ['records', props.tableName, queryParams.value]),
    queryFn: ({ pageParam }) =>
      api.getRecords(props.tableName, {
        ...queryParams.value,
        ...(pageParam ? { cursor: pageParam as string } : {}),
      }),
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })

// 用 spread 创建纯对象，避免 Vue Proxy 被 AG Grid 误读
const rowData = computed(() =>
  (data.value?.pages.flatMap(p => p.data.map(r => ({ ...r }))) ?? []) as RecordRow[]
)

// ── Grid 事件 ─────────────────────────────────────────────────
function getRowId(params: { data: RecordRow }) {
  return String(params.data.id)
}

function onGridReady(params: { api: GridApi }) {
  gridApi.value = params.api
  if (rowData.value.length > 0) {
    params.api.setGridOption('rowData', rowData.value)
  }
}

// 显式推送 rowData 到 AG Grid（ag-grid-vue3 的 prop watcher 不可靠）
watch(rowData, (rows) => {
  gridApi.value?.setGridOption('rowData', rows)
}, { flush: 'post' })

function onBodyScroll() {
  if (!gridApi.value || !hasNextPage.value || isFetchingNextPage.value) return
  const lastIdx = gridApi.value.getLastDisplayedRowIndex()
  if (lastIdx >= rowData.value.length - 8) fetchNextPage()
}

function onColumnResized(event: ColumnResizedEvent) {
  if (!event.finished || !event.column) return
  const colId = event.column.getColId()
  if (colId.startsWith('__')) return
  const w = event.column.getActualWidth()
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    api.updateFieldMeta(props.tableName, colId, { width: w }).catch(() => {})
  }, 500)
}

function onSortChanged(event: SortChangedEvent) {
  const sorted = event.api.getColumnState().find(c => c.sort)
  if (sorted && sorted.colId) {
    sortField.value = sorted.colId
    sortDir.value = sorted.sort as 'asc' | 'desc'
  } else {
    sortField.value = ''
  }
  invalidate()
}

onBeforeUnmount(() => { if (resizeTimer) clearTimeout(resizeTimer) })

// ── 函数式 cell renderer ─────────────────────────────────────
function expandCellRenderer(params: { data: Record<string, unknown>; rowIndex: number }): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'ag-expand-btn'
  btn.textContent = '⤢'
  btn.title = '展开详情'
  btn.onclick = (e) => { e.stopPropagation(); openExpand(params.data, params.rowIndex) }
  return btn
}

function typedCellRenderer(params: { value: unknown; fieldType: FieldType; selectOptions: SelectOption[] | null }): HTMLElement | string {
  const { value, fieldType, selectOptions } = params
  if (value == null || value === '') return '<span class="ag-cell-empty">—</span>'

  switch (fieldType) {
    case 'checkbox':
      return value
        ? '<span style="color:#18a058;font-weight:700;font-size:15px">✓</span>'
        : '<span style="color:#ccc">—</span>'

    case 'email': {
      const a = document.createElement('a')
      a.href = `mailto:${value}`
      a.className = 'ag-cell-link'
      a.textContent = String(value)
      a.onclick = (e) => e.stopPropagation()
      return a
    }

    case 'url': {
      const str = String(value)
      if (isValidUrl(str)) {
        const a = document.createElement('a')
        a.href = str
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.className = 'ag-cell-link'
        a.textContent = str
        a.title = str
        a.onclick = (e) => e.stopPropagation()
        return a
      }
      return `<span class="ag-cell-text">${esc(str)}</span>`
    }

    case 'number': {
      const n = Number(value)
      return `<span class="ag-cell-num">${isNaN(n) ? esc(String(value)) : n.toLocaleString('zh-CN')}</span>`
    }

    case 'currency': {
      const n = Number(value)
      return `<span class="ag-cell-num">¥${isNaN(n) ? esc(String(value)) : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
    }

    case 'percent': {
      const n = Number(value)
      return `<span class="ag-cell-num">${isNaN(n) ? esc(String(value)) : n.toLocaleString('zh-CN')}%</span>`
    }

    case 'date':
      return `<span class="ag-cell-text">${formatDate(value)}</span>`

    case 'datetime':
      return `<span class="ag-cell-text">${formatDatetime(value)}</span>`

    case 'select': {
      if (selectOptions?.length) {
        const opt = selectOptions.find(o => o.value === String(value))
        if (opt) {
          return `<span class="ag-cell-badge" style="background:${opt.color}22;color:${opt.color};border-color:${opt.color}55">${esc(opt.label)}</span>`
        }
      }
      return `<span class="ag-cell-text">${esc(String(value))}</span>`
    }

    case 'text':
    case 'longtext':
    default: {
      const str = String(value)
      if (isValidUrl(str)) {
        const a = document.createElement('a')
        a.href = str
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.className = 'ag-cell-link'
        a.textContent = str
        a.title = str
        a.onclick = (e) => e.stopPropagation()
        return a
      }
      return `<span class="ag-cell-text">${esc(str)}</span>`
    }
  }
}

function actionsCellRenderer(params: { data: RecordRow }): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ag-actions-wrap'

  const editBtn = document.createElement('button')
  editBtn.className = 'ag-act-btn'
  editBtn.textContent = '编辑'
  editBtn.onclick = (e) => { e.stopPropagation(); openEdit(params.data) }

  const delBtn = document.createElement('button')
  delBtn.className = 'ag-act-btn ag-act-btn--del'
  delBtn.textContent = '删除'
  delBtn.onclick = (e) => { e.stopPropagation(); handleDelete(params.data) }

  wrap.appendChild(editBtn)
  wrap.appendChild(delBtn)
  return wrap
}

// ── 工具函数 ──────────────────────────────────────────────────
function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(v: unknown): string {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // 尝试作为数字（Unix 时间戳）
  const n = Number(s)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n < 1e10 ? n * 1000 : n)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? esc(s) : d.toISOString().slice(0, 10)
}

function formatDatetime(v: unknown): string {
  if (!v) return ''
  // 统一转数字处理（兼容 number、"1773571051"、"1773571051.0" 等）
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n < 1e10 ? n * 1000 : n)
    if (!isNaN(d.getTime())) {
      const pad = (x: number) => String(x).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  }
  // 尝试日期字符串
  const d = new Date(String(v))
  if (!isNaN(d.getTime())) {
    const pad = (x: number) => String(x).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return esc(String(v))
}

// ── 字段操作 ──────────────────────────────────────────────────
async function saveRename(field: FieldMeta, newTitle: string) {
  try {
    await api.updateFieldMeta(props.tableName, field.column_name, { title: newTitle })
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
  } catch (err) { message.error((err as Error).message) }
}

async function toggleHidden(field: FieldMeta) {
  try {
    await api.updateFieldMeta(props.tableName, field.column_name, { is_hidden: !field.is_hidden })
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
  } catch (err) { message.error((err as Error).message) }
}

function deleteField(field: FieldMeta) {
  dialog.warning({
    title: '确认删除字段',
    content: `确定隐藏字段「${field.title}」？（数据不会丢失）`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteField(props.tableName, field.column_name)
        queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
        emit('refresh')
      } catch (err) { message.error((err as Error).message) }
    },
  })
}

// ── 记录 CRUD ─────────────────────────────────────────────────
function openCreate() { editingRecord.value = null; showForm.value = true }

function openEdit(row: RecordRow) { editingRecord.value = row; showForm.value = true }

async function handleFormSubmit(formData: Record<string, unknown>) {
  try {
    if (editingRecord.value) {
      await api.updateRecord(props.tableName, editingRecord.value.id, formData)
      message.success('记录已更新')
    } else {
      await api.createRecord(props.tableName, formData)
      message.success('记录已新增')
    }
    invalidate()
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
    showForm.value = true
  }
}

function handleDelete(row: RecordRow) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除 id=${row.id} 的记录？此操作不可撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteRecord(props.tableName, row.id)
        message.success('记录已删除')
        invalidate()
        emit('refresh')
      } catch (err) { message.error((err as Error).message) }
    },
  })
}

function openExpand(row: Record<string, unknown>, _agIdx: number) {
  expandRow.value = row
  // 用 ID 在 rowData 中查找真实索引（AG Grid 的 rowIndex 排序后会错位）
  const realIdx = rowData.value.findIndex(r => r.id === row.id)
  expandIndex.value = realIdx >= 0 ? realIdx : 0
  showExpand.value = true
}

function handleFilterChange(filters: Filter[]) {
  activeFilters.value = filters
  invalidate()
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['records', props.tableName] })
}

const refreshing = ref(false)

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['records', props.tableName] }),
      queryClient.refetchQueries({ queryKey: ['tables'] }),
    ])
    emit('refresh')
  } finally {
    refreshing.value = false
  }
}
</script>

<!-- 全局样式：AG Grid 内部元素无法用 scoped 穿透 -->
<style>
/* 单元格垂直居中 + 内容溢出裁剪 */
.ag-theme-alpine .ag-cell {
  display: flex !important;
  align-items: center;
  overflow: hidden;
}
.ag-theme-alpine .ag-header-cell-label {
  display: flex;
  align-items: center;
}
/* 展开按钮仅悬浮时可见 */
.ag-theme-alpine .ag-expand-btn {
  background: none;
  border: 1px solid #d0d3da;
  border-radius: 3px;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 10px;
  color: #888;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  visibility: hidden;
}
.ag-theme-alpine .ag-row-hover .ag-expand-btn { visibility: visible; }
.ag-theme-alpine .ag-expand-btn:hover { background: #eef0ff; border-color: #4f6ef7; color: #4f6ef7; }
.ag-theme-alpine .expand-cell { display: flex !important; align-items: center; justify-content: center; }
/* 单元格样式 */
.ag-cell-empty { color: #ccc; }
.ag-cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-cell-num { text-align: right; font-variant-numeric: tabular-nums; width: 100%; }
.ag-cell-link { color: #4f6ef7; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-cell-link:hover { text-decoration: underline; }
.ag-cell-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; border: 1px solid; font-weight: 500; }
/* 操作按钮 */
.ag-actions-wrap { display: flex; align-items: center; gap: 4px; height: 100%; }
.ag-act-btn {
  background: none; border: 1px solid #e0e2e8; border-radius: 4px;
  padding: 1px 7px; font-size: 12px; cursor: pointer; color: #555; white-space: nowrap;
}
.ag-act-btn:hover { background: #f0f2f5; }
.ag-act-btn--del { color: #d03050; border-color: #fcc; }
.ag-act-btn--del:hover { background: #fff0f3; }
</style>

<style scoped>
.grid-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #e8eaf0;
  flex-shrink: 0;
}
.table-title { font-size: 15px; font-weight: 600; color: #1a1d2e; }
.row-count { font-size: 12px; color: #999; background: #f0f2f5; padding: 2px 8px; border-radius: 10px; }
.ag-grid-box { flex: 1; min-height: 200px; }
.grid-footer {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 6px; height: 32px; flex-shrink: 0; border-top: 1px solid #f0f2f5;
}
.footer-hint { font-size: 12px; color: #bbb; }
.spin-icon {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
