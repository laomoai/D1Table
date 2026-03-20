<template>
  <div class="grid-wrapper">
    <!-- 工具栏 -->
    <div class="toolbar">
      <span class="table-title">{{ displayTitle }}</span>
      <span v-if="totalCount !== null" class="row-count">{{ totalCount }} records</span>
      <div style="flex:1" />
      <!-- 搜索 -->
      <n-input
        v-model:value="searchText"
        placeholder="Search..."
        size="small"
        clearable
        style="width: 180px;"
      />
      <n-button size="small" @click="showFilterBar = !showFilterBar">
        Filter{{ activeFilters.length ? ` (${activeFilters.length})` : '' }}
      </n-button>
      <n-button size="small" @click="showFieldPanel = true">
        Fields{{ hiddenCount ? ` (${hiddenCount} hidden)` : '' }}
      </n-button>
      <n-button size="small" quaternary @click="refreshAll" title="Refresh" :disabled="refreshing">
        <span :class="{ 'spin-icon': refreshing }">↻</span>
      </n-button>
      <n-button size="small" type="primary" @click="openCreate">+ Add</n-button>
      <!-- 视图切换 -->
      <div class="view-switcher">
        <button class="view-btn view-btn--active" title="Grid view">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="2.5" rx="0.5"/>
            <rect x="8" y="1" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="5.5" width="5" height="2.5" rx="0.5"/>
            <rect x="8" y="5.5" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="10" width="5" height="2.5" rx="0.5"/>
            <rect x="8" y="10" width="5" height="2.5" rx="0.5"/>
          </svg>
        </button>
        <button class="view-btn" title="Gallery view" @click="emit('switchView', 'gallery')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="5" rx="1"/>
            <rect x="8" y="1" width="5" height="5" rx="1"/>
            <rect x="1" y="8" width="5" height="5" rx="1"/>
            <rect x="8" y="8" width="5" height="5" rx="1"/>
          </svg>
        </button>
        <button class="view-btn" title="Chart view" @click="emit('switchView', 'chart')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,11 4,6 7,9 10,3 13,6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 批量操作栏 -->
    <div v-if="selectedCount > 0" class="selection-bar">
      <span class="sel-count">{{ selectedCount }} row{{ selectedCount > 1 ? 's' : '' }} selected</span>
      <n-button size="tiny" type="error" :loading="batchDeleting" @click="handleBatchDelete">
        Delete selected
      </n-button>
      <n-button size="tiny" quaternary @click="clearSelection">Clear</n-button>
    </div>

    <!-- 筛选栏 -->
    <FilterBar
      v-if="showFilterBar"
      :columns="visibleFields"
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
        :rowSelection="rowSelection"
        @grid-ready="onGridReady"
        @column-resized="onColumnResized"
        @sort-changed="onSortChanged"
        @body-scroll="onBodyScroll"
        @selection-changed="onSelectionChanged"
      />
    </div>

    <!-- 底栏 -->
    <div class="grid-footer">
      <n-spin v-if="isFetchingNextPage || isLoading" size="small" />
      <span v-else-if="rowData.length === 0" class="footer-hint">No data</span>
      <span v-else-if="!hasNextPage" class="footer-hint">
        All {{ rowData.length }} records loaded
      </span>
      <span v-else class="footer-hint">{{ rowData.length }} records loaded — scroll for more</span>
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
    ref="fieldPanelRef"
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
import { ref, computed, watch, onBeforeUnmount, markRaw, shallowRef, nextTick } from 'vue'
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query'
import { useMessage, useDialog, NButton, NSpin, NInput } from 'naive-ui'
import { AgGridVue } from 'ag-grid-vue3'
import type { ColDef, GridApi, ColumnResizedEvent, SortChangedEvent, SelectionChangedEvent } from 'ag-grid-community'

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

const emit = defineEmits<{ refresh: []; switchView: [view: string] }>()

const message = useMessage()
const dialog = useDialog()
const queryClient = useQueryClient()

// ── 状态 ──────────────────────────────────────────────────────
const showFilterBar = ref(false)
const showForm = ref(false)
const showFieldPanel = ref(false)
const fieldPanelRef = ref<InstanceType<typeof FieldPanel>>()
const showExpand = ref(false)
const editingRecord = ref<RecordRow | null>(null)
const activeFilters = ref<Filter[]>([])
const expandRow = ref<Record<string, unknown> | null>(null)
const expandIndex = ref(0)
const gridApi = shallowRef<GridApi | null>(null)
const sortField = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
const searchText = ref('')
const selectedCount = ref(0)
const batchDeleting = ref(false)
let resizeTimer: ReturnType<typeof setTimeout> | null = null

// ── 行选择配置 ────────────────────────────────────────────────
const rowSelection = {
  mode: 'multiRow' as const,
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
}

// ── 搜索：监听 searchText 更新 AG Grid quick filter ──────────
watch(searchText, (v) => {
  gridApi.value?.setGridOption('quickFilterText', v)
})

// ── 计算属性 ──────────────────────────────────────────────────
const visibleFields = computed(() =>
  props.fields
    .filter(f => !f.is_hidden)
    .sort((a, b) => a.order_index - b.order_index)
)
const hiddenCount = computed(() => props.fields.filter(f => f.is_hidden).length)
const displayTitle = computed(() => props.tableTitle || props.tableName)


// ── 列定义 ──────────────────────────────────────────────────
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
        onEditField: () => { showFieldPanel.value = true; nextTick(() => fieldPanelRef.value?.expand(field.column_name)) },
      },
      cellRenderer: typedCellRenderer,
      cellRendererParams: {
        fieldType: field.field_type,
        selectOptions: field.select_options,
      },
    })
  }

  // 操作列（"..." 菜单）
  cols.push({
    colId: '__actions',
    headerName: '',
    width: 48,
    minWidth: 48,
    maxWidth: 48,
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

function onSelectionChanged(event: SelectionChangedEvent) {
  selectedCount.value = event.api.getSelectedRows().length
}

// ── 批量删除 ─────────────────────────────────────────────────
function clearSelection() {
  gridApi.value?.deselectAll()
  selectedCount.value = 0
}

function handleBatchDelete() {
  const rows = gridApi.value?.getSelectedRows() as RecordRow[] | undefined
  if (!rows?.length) return

  dialog.warning({
    title: 'Confirm batch delete',
    content: `Delete ${rows.length} selected record${rows.length > 1 ? 's' : ''}? This action cannot be undone.`,
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      batchDeleting.value = true
      try {
        await Promise.all(rows.map(r => api.deleteRecord(props.tableName, r.id)))
        message.success(`${rows.length} record${rows.length > 1 ? 's' : ''} deleted`)
        selectedCount.value = 0
        invalidate()
        emit('refresh')
      } catch (err) {
        message.error((err as Error).message)
      } finally {
        batchDeleting.value = false
      }
    },
  })
}

onBeforeUnmount(() => {
  if (resizeTimer) clearTimeout(resizeTimer)
  closeDropdown()
  document.removeEventListener('click', closeDropdown)
})

// 注册全局 click 关闭下拉菜单
document.addEventListener('click', closeDropdown)

// ── 下拉菜单（"..." 操作列）────────────────────────────────────
let activeDropdown: HTMLElement | null = null

function closeDropdown() {
  activeDropdown?.remove()
  activeDropdown = null
}

// ── 函数式 cell renderer ─────────────────────────────────────
function expandCellRenderer(params: { data: Record<string, unknown>; rowIndex: number }): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'ag-expand-btn'
  btn.textContent = '⤢'
  btn.title = 'Expand details'
  btn.onclick = (e) => { e.stopPropagation(); openExpand(params.data, params.rowIndex) }
  return btn
}

function typedCellRenderer(params: { value: unknown; fieldType: FieldType; selectOptions: SelectOption[] | null }): HTMLElement | string {
  const { value, fieldType, selectOptions } = params
  if (value == null || value === '' || value === '[]' || value === 'null' || (Array.isArray(value) && value.length === 0)) return '<span class="ag-cell-empty">—</span>'

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
      return `<span class="ag-cell-num">${isNaN(n) ? esc(String(value)) : n.toLocaleString('en-US')}</span>`
    }

    case 'currency': {
      const n = Number(value)
      return `<span class="ag-cell-num">¥${isNaN(n) ? esc(String(value)) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
    }

    case 'percent': {
      const n = Number(value)
      return `<span class="ag-cell-num">${isNaN(n) ? esc(String(value)) : n.toLocaleString('en-US')}%</span>`
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

    case 'image': {
      try {
        const img = document.createElement('img')
        img.src = `/api/files/${(JSON.parse(String(value)) as { thumb: string }).thumb}`
        img.style.cssText = 'width:24px;height:24px;object-fit:cover;border-radius:3px;display:block'
        img.loading = 'lazy'
        return img
      } catch {
        return '<span class="ag-cell-empty">—</span>'
      }
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

  const btn = document.createElement('button')
  btn.className = 'ag-act-menu-btn'
  btn.textContent = '···'
  btn.title = 'More actions'
  btn.onclick = (e) => {
    e.stopPropagation()
    closeDropdown()

    const rect = btn.getBoundingClientRect()
    const menu = document.createElement('div')
    menu.className = 'ag-act-dropdown'
    menu.style.top = (rect.bottom + 4) + 'px'
    menu.style.left = (rect.right - 120) + 'px'

    const editItem = document.createElement('div')
    editItem.className = 'ag-act-dropdown-item'
    editItem.textContent = 'Edit'
    editItem.onclick = (ev) => { ev.stopPropagation(); closeDropdown(); openEdit(params.data) }

    const delItem = document.createElement('div')
    delItem.className = 'ag-act-dropdown-item ag-act-dropdown-item--del'
    delItem.textContent = 'Delete'
    delItem.onclick = (ev) => { ev.stopPropagation(); closeDropdown(); handleDelete(params.data) }

    menu.appendChild(editItem)
    menu.appendChild(delItem)
    document.body.appendChild(menu)
    activeDropdown = menu
  }

  wrap.appendChild(btn)
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

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(v: unknown): string {
  if (!v) return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const n = Number(s)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n < 1e10 ? n * 1000 : n)
    if (!isNaN(d.getTime())) return localDateStr(d)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? esc(s) : localDateStr(d)
}

function formatDatetime(v: unknown): string {
  if (!v) return ''
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n < 1e10 ? n * 1000 : n)
    if (!isNaN(d.getTime())) {
      const pad = (x: number) => String(x).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  }
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
    title: 'Confirm delete field',
    content: `Hide field "${field.title}"? (Data will not be lost)`,
    positiveText: 'Confirm',
    negativeText: 'Cancel',
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
      message.success('Record updated')
    } else {
      await api.createRecord(props.tableName, formData)
      message.success('Record added')
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
    title: 'Confirm delete',
    content: `Delete record id=${row.id}? This action cannot be undone.`,
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.deleteRecord(props.tableName, row.id)
        message.success('Record deleted')
        invalidate()
        emit('refresh')
      } catch (err) { message.error((err as Error).message) }
    },
  })
}

function openExpand(row: Record<string, unknown>, _agIdx: number) {
  expandRow.value = row
  const realIdx = rowData.value.findIndex(r => r.id === row.id)
  expandIndex.value = realIdx >= 0 ? realIdx : 0
  showExpand.value = true
}

function handleFilterChange(filters: Filter[]) {
  // 浅克隆断开与 FilterBar 内部数组的引用共享
  // 否则第二次 Apply 时同一引用导致 Vue ref setter 不触发更新
  activeFilters.value = filters.map(f => ({ ...f }))
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
/* 单元格垂直居中 + 内容溢出裁剪 + 列分割线 */
.ag-theme-alpine .ag-cell {
  display: flex !important;
  align-items: center;
  overflow: hidden;
  border-right: 1px solid #eef0f4 !important;
}
.ag-theme-alpine .ag-header-cell {
  border-right: 1px solid #eef0f4 !important;
}
.ag-theme-alpine .ag-header-cell-label {
  display: flex;
  align-items: center;
}
/* 行悬停高亮 */
.ag-theme-alpine .ag-row-hover {
  background-color: #f1f1ef !important;
}
.ag-theme-alpine .ag-row-selected {
  background-color: #e9f0fb !important;
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
/* "···" 操作按钮 */
.ag-actions-wrap { display: flex; align-items: center; justify-content: center; height: 100%; }
.ag-act-menu-btn {
  background: none;
  border: none;
  padding: 2px 6px;
  font-size: 16px;
  cursor: pointer;
  color: #bbb;
  border-radius: 4px;
  line-height: 1;
  visibility: hidden;
  letter-spacing: 1px;
}
.ag-theme-alpine .ag-row-hover .ag-act-menu-btn { visibility: visible; }
.ag-act-menu-btn:hover { background: #f0f2f5; color: #555; }
/* 下拉菜单 */
.ag-act-dropdown {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e0e2e8;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  min-width: 120px;
  overflow: hidden;
}
.ag-act-dropdown-item {
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  color: #333;
  transition: background 0.1s;
}
.ag-act-dropdown-item:hover { background: #f5f6f8; }
.ag-act-dropdown-item--del { color: #d03050; }
.ag-act-dropdown-item--del:hover { background: #fff0f3; }
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
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #e8eaf0;
  flex-shrink: 0;
}
.table-title { font-size: 15px; font-weight: 600; color: #1a1d2e; }
.row-count { font-size: 12px; color: #999; background: #f0f2f5; padding: 2px 8px; border-radius: 10px; }
/* 批量操作栏 */
.selection-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: #eef1ff;
  border-bottom: 1px solid #d8ddff;
  flex-shrink: 0;
}
.sel-count {
  font-size: 13px;
  font-weight: 500;
  color: #4f6ef7;
}
/* 视图切换 */
.view-switcher {
  display: flex;
  gap: 2px;
  border: 1px solid #e0e2e8;
  border-radius: 6px;
  padding: 2px;
  background: #f7f8fa;
}
.view-btn {
  background: none;
  border: none;
  border-radius: 4px;
  width: 26px;
  height: 22px;
  cursor: pointer;
  color: #aaa;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s, color 0.15s;
}
.view-btn:hover { background: #eef0ff; color: #4f6ef7; }
.view-btn--active { background: #fff; color: #4f6ef7; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: default; }

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
