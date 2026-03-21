<template>
  <div class="gallery-wrapper">
    <!-- 工具栏 -->
    <div class="toolbar">
      <span class="table-title">
        <button class="title-icon-btn" @click="showIconPicker = true" title="Change icon">
          <span v-if="props.tableIcon && !props.tableIcon.startsWith('ion:')" class="title-icon-emoji">{{ props.tableIcon }}</span>
          <ion-icon v-else-if="props.tableIcon" :name="props.tableIcon.slice(4)" :size="16" style="opacity:0.7;vertical-align:middle;" />
          <span v-else class="title-icon-placeholder">📊</span>
        </button>
        {{ displayTitle }}
      </span>
      <span v-if="totalCount !== null" class="row-count">{{ totalCount }} records</span>
      <div style="flex:1" />
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
      <n-button size="small" quaternary @click="refreshAll" title="Refresh" :disabled="refreshing">
        <span :class="{ 'spin-icon': refreshing }">↻</span>
      </n-button>
      <n-dropdown :options="exportOptions" @select="handleExport" trigger="click">
        <n-button size="small" :loading="exporting">Export</n-button>
      </n-dropdown>
      <n-button size="small" type="primary" @click="openCreate" :disabled="props.isLocked">+ Add</n-button>
      <n-button size="small" quaternary @click="toggleLock" :title="props.isLocked ? 'Unlock table' : 'Lock table'">
        {{ props.isLocked ? '🔒' : '🔓' }}
      </n-button>
      <!-- 视图切换 -->
      <div class="view-switcher">
        <button class="view-btn" title="Grid view" @click="emit('switchView', 'grid')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="2.5" rx="0.5"/>
            <rect x="8" y="1" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="5.5" width="5" height="2.5" rx="0.5"/>
            <rect x="8" y="5.5" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="10" width="5" height="2.5" rx="0.5"/>
            <rect x="8" y="10" width="5" height="2.5" rx="0.5"/>
          </svg>
        </button>
        <button class="view-btn view-btn--active" title="Gallery view">
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

    <!-- 筛选栏 -->
    <FilterBar
      v-if="showFilterBar"
      :columns="visibleFields"
      @change="handleFilterChange"
    />

    <!-- 卡片区域 -->
    <div class="gallery-scroll">
      <div v-if="isLoading" class="gallery-empty"><n-spin /></div>
      <div v-else-if="filteredRows.length === 0" class="gallery-empty">No records</div>
      <div v-else class="gallery-grid">
        <div
          v-for="record in filteredRows"
          :key="record.id"
          class="gallery-card"
          @click="openExpand(record)"
        >
          <!-- 封面图 -->
          <div v-if="coverField" class="card-cover">
            <img
              v-if="coverThumb(record)"
              :src="`/api/files/${coverThumb(record)}`"
              class="card-cover-img"
              loading="lazy"
            />
            <div
                v-else
                class="card-cover-gradient"
                :style="{ background: coverGradient(record) }"
              />
          </div>

          <!-- 标题 -->
          <div class="card-title">
            <span v-if="titleValue(record)">{{ titleValue(record) }}</span>
            <span v-else class="card-title--empty">#{{ record.id }}</span>
          </div>
          <!-- 字段 -->
          <div v-if="bodyFields.length" class="card-body">
            <div
              v-for="field in bodyFields"
              :key="field.column_name"
              class="card-field"
            >
              <span class="field-label">{{ field.title }}</span>
              <span class="field-value">
                <CellValue
                  :value="record[field.column_name]"
                  :field-type="field.field_type"
                  :select-options="field.select_options"
                />
              </span>
            </div>
          </div>
          <!-- 操作（悬浮显示）-->
          <div v-if="!props.isLocked" class="card-actions" @click.stop>
            <button class="card-btn" @click="openEdit(record)">Edit</button>
            <button class="card-btn card-btn--del" @click="handleDelete(record)">Delete</button>
          </div>
        </div>
      </div>

    </div>

    <!-- 底栏 -->
    <div class="gallery-footer">
      <n-spin v-if="isFetching" size="small" />
      <template v-else-if="totalCount !== null && totalCount > 0">
        <n-pagination
          v-model:page="currentPage"
          v-model:page-size="pageSize"
          :item-count="totalCount"
          :page-sizes="[20, 30, 50, 100]"
          show-size-picker
          size="small"
          :disabled="isFetching"
        />
      </template>
      <span v-else-if="!isFetching && rowData.length === 0" class="footer-hint">No data</span>
    </div>
  </div>

  <!-- 新增/编辑弹窗 -->
  <RecordForm
    v-model:show="showForm"
    :fields="fields"
    :record="editingRecord"
    @submit="handleFormSubmit"
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

  <AppModal v-model:show="showIconPicker" title="Choose Icon" width="360px" height="auto">
    <IconPicker :current-icon="props.tableIcon ?? null" @select="onIconSelect" />
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useMessage, useDialog, NButton, NSpin, NInput, NPagination, NDropdown } from 'naive-ui'

import { api, type FieldMeta, type RecordRow } from '@/api/client'
import FilterBar, { type Filter } from './FilterBar.vue'
import RecordForm from './RecordForm.vue'
import RowExpand from './RowExpand.vue'
import CellValue from './CellValue.vue'
import IonIcon from './IonIcon.vue'
import AppModal from './AppModal.vue'
const IconPicker = defineAsyncComponent(() => import('./IconPicker.vue'))

const props = defineProps<{
  tableName: string
  fields: FieldMeta[]
  tableTitle?: string | null
  tableIcon?: string | null
  totalCount: number | null
  isLocked?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  switchView: [view: string]
}>()

const message = useMessage()
const dialog = useDialog()
const queryClient = useQueryClient()

// ── 状态 ──────────────────────────────────────────────────────
const showFilterBar = ref(false)
const showForm = ref(false)
const showExpand = ref(false)
const showIconPicker = ref(false)
const editingRecord = ref<RecordRow | null>(null)
const activeFilters = ref<Filter[]>([])
const expandRow = ref<RecordRow | null>(null)
const expandIndex = ref(0)
const searchText = ref('')
const refreshing = ref(false)
const currentPage = ref(1)
const pageSize = ref(parseInt(localStorage.getItem('d1table_page_size') ?? '30', 10) || 30)
const exporting = ref(false)

const exportOptions = [
  { label: 'Export CSV', key: 'csv' },
  { label: 'Export JSON', key: 'json' },
]

async function onIconSelect(icon: string | null) {
  showIconPicker.value = false
  try {
    await api.updateTableIcon(props.tableName, icon)
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function toggleLock() {
  try {
    await api.setTableLocked(props.tableName, !props.isLocked)
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handleExport(format: 'csv' | 'json') {
  exporting.value = true
  try {
    const exportParams: Record<string, string | number> = {}
    for (const f of activeFilters.value) {
      if (f.field && f.value) {
        exportParams[`filter[${f.field}${f.op === 'eq' ? '' : `__${f.op}`}]`] = f.value
      }
    }
    const blob = await api.exportRecords(props.tableName, { ...exportParams, format })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.tableTitle || props.tableName}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    exporting.value = false
  }
}

// ── 计算属性 ──────────────────────────────────────────────────
const visibleFields = computed(() =>
  props.fields
    .filter(f => !f.is_hidden)
    .sort((a, b) => a.order_index - b.order_index)
)

const displayTitle = computed(() => props.tableTitle || props.tableName)

// 封面字段：第一个 image 字段（可选）
const coverField = computed(() =>
  visibleFields.value.find(f => f.field_type === 'image') ?? null
)

// 标题字段：第一个 text / longtext / email 字段
const titleField = computed(() =>
  visibleFields.value.find(f => ['text', 'longtext', 'email'].includes(f.field_type))
  ?? visibleFields.value.find(f => f.field_type !== 'image')
  ?? null
)

// 正文字段：排除封面和标题字段，最多 5 个
const bodyFields = computed(() =>
  visibleFields.value
    .filter(f => f !== titleField.value && f !== coverField.value)
    .slice(0, 5)
)

function coverThumb(record: RecordRow): string | null {
  if (!coverField.value) return null
  const v = record[coverField.value.column_name]
  if (!v) return null
  try { return (JSON.parse(String(v)) as { thumb: string }).thumb } catch { return null }
}

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #96fbc4, #f9f586)',
  'linear-gradient(135deg, #f77062, #fe5196)',
  'linear-gradient(135deg, #c3cfe2, #c3cfe2)',
]

function coverGradient(record: RecordRow): string {
  return COVER_GRADIENTS[Number(record.id) % COVER_GRADIENTS.length]
}

function titleValue(record: RecordRow): string {
  if (!titleField.value) return ''
  const v = record[titleField.value.column_name]
  return v != null && v !== '' ? String(v) : ''
}

// ── 查询参数 ──────────────────────────────────────────────────
const queryParams = computed(() => {
  const params: Record<string, string | number> = {
    page_size: pageSize.value,
    page: currentPage.value,
  }
  for (const f of activeFilters.value) {
    if (f.field && f.value) {
      params[`filter[${f.field}${f.op === 'eq' ? '' : `__${f.op}`}]`] = f.value
    }
  }
  return params
})

// 过滤条件或每页条数改变时重置到第一页；pageSize 变化时持久化
watch([activeFilters, pageSize], () => {
  currentPage.value = 1
})
watch(pageSize, (v) => {
  localStorage.setItem('d1table_page_size', String(v))
})

// ── 数据查询 ──────────────────────────────────────────────────
const { data, isLoading, isFetching } =
  useQuery({
    queryKey: computed(() => ['records', props.tableName, queryParams.value]),
    queryFn: () => api.getRecords(props.tableName, queryParams.value),
  })

const rowData = computed(() =>
  (data.value?.data.map(r => ({ ...r })) ?? []) as RecordRow[]
)

// 客户端搜索过滤
const filteredRows = computed(() => {
  if (!searchText.value.trim()) return rowData.value
  const q = searchText.value.trim().toLowerCase()
  return rowData.value.filter(record =>
    visibleFields.value.some(f => {
      const v = record[f.column_name]
      return v != null && String(v).toLowerCase().includes(q)
    })
  )
})

// ── 工具方法 ──────────────────────────────────────────────────
function handleFilterChange(filters: Filter[]) {
  activeFilters.value = filters
  currentPage.value = 1
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['records', props.tableName] })
}

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

// ── 记录操作 ──────────────────────────────────────────────────
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

function openExpand(row: RecordRow) {
  expandRow.value = row
  const idx = rowData.value.findIndex(r => r.id === row.id)
  expandIndex.value = idx >= 0 ? idx : 0
  showExpand.value = true
}

// ── 键盘翻页（左右箭头）─────────────────────────────────────
function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
  if (e.key === 'ArrowLeft' && currentPage.value > 1) {
    currentPage.value--
  } else if (e.key === 'ArrowRight') {
    const totalPages = Math.ceil((props.totalCount ?? 0) / pageSize.value)
    if (currentPage.value < totalPages) currentPage.value++
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.gallery-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #e8eaf0;
  flex-shrink: 0;
}
.table-title { font-size: 15px; font-weight: 600; color: #1a1d2e; display: flex; align-items: center; gap: 5px; }
.title-icon-btn {
  background: none; border: none; cursor: pointer; padding: 2px 4px; border-radius: 4px;
  font-size: 16px; line-height: 1; display: flex; align-items: center; transition: background 0.1s;
}
.title-icon-btn:hover { background: rgba(0,0,0,0.06); }
.title-icon-emoji { font-size: 16px; line-height: 1; }
.title-icon-placeholder { opacity: 0.4; font-size: 16px; }
.row-count { font-size: 12px; color: #999; background: #f0f2f5; padding: 2px 8px; border-radius: 10px; }

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

/* 卡片滚动区 */
.gallery-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.gallery-empty {
  padding: 60px;
  text-align: center;
  color: #bbb;
}

/* 卡片网格 */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

/* 封面图 */
.card-cover {
  margin: -14px -16px 0;
  border-radius: 10px 10px 0 0;
  overflow: hidden;
  height: 140px;
  background: #f0f2f5;
}
.card-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.card-cover-gradient {
  width: 100%;
  height: 100%;
}

/* 单张卡片 */
.gallery-card {
  border: 1px solid #e8eaf0;
  border-radius: 10px;
  padding: 14px 16px 10px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gallery-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  border-color: #c8cbda;
}

/* 卡片标题 */
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1d2e;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.card-title--empty { color: #bbb; font-weight: 400; font-style: italic; }

/* 字段列表 */
.card-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.card-field {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  min-height: 18px;
}
.field-label {
  color: #aaa;
  flex-shrink: 0;
  min-width: 52px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-value {
  color: #333;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

/* 操作按钮（悬浮显示）*/
.card-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
  padding-top: 6px;
  border-top: 1px solid #f0f2f5;
}
.gallery-card:hover .card-actions { opacity: 1; }
.card-btn {
  background: none;
  border: 1px solid #e0e2e8;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  color: #555;
  transition: background 0.1s;
}
.card-btn:hover { background: #f5f6f8; }
.card-btn--del { color: #d03050; }
.card-btn--del:hover { background: #fff0f3; border-color: #ffd0d9; }

/* 底栏 */
.gallery-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  min-height: 40px;
  flex-shrink: 0;
  border-top: 1px solid #f0f2f5;
}
.gallery-footer :deep(.n-pagination-item) {
  min-width: 36px;
  height: 30px;
  font-size: 13px;
}
.gallery-footer :deep(.n-pagination-item--button) {
  min-width: 40px;
}
.footer-hint { font-size: 12px; color: #bbb; }

.spin-icon {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
