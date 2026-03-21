<template>
  <div class="kanban-wrapper">
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

      <!-- 分组字段选择 -->
      <span class="toolbar-label">Group by</span>
      <n-select
        v-model:value="groupField"
        :options="selectFieldOptions"
        size="small"
        style="width: 160px;"
        placeholder="Select field"
      />

      <n-button size="small" quaternary @click="refreshAll" title="Refresh" :disabled="refreshing">
        <span :class="{ 'spin-icon': refreshing }">↻</span>
      </n-button>
      <n-button size="small" type="primary" @click="openCreate" :disabled="props.isLocked">+ Add</n-button>
      <n-button size="small" quaternary @click="toggleLock" :title="props.isLocked ? 'Unlock table' : 'Lock table'">
        {{ props.isLocked ? '🔒' : '🔓' }}
      </n-button>

      <!-- 视图切换 -->
      <div class="view-switcher">
        <button class="view-btn" title="Grid view" @click="emit('switchView', 'grid')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="2.5" rx="0.5"/><rect x="8" y="1" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="5.5" width="5" height="2.5" rx="0.5"/><rect x="8" y="5.5" width="5" height="2.5" rx="0.5"/>
            <rect x="1" y="10" width="5" height="2.5" rx="0.5"/><rect x="8" y="10" width="5" height="2.5" rx="0.5"/>
          </svg>
        </button>
        <button class="view-btn" title="Gallery view" @click="emit('switchView', 'gallery')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/>
            <rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/>
          </svg>
        </button>
        <button class="view-btn view-btn--active" title="Kanban view">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="3" height="10" rx="0.5"/><rect x="5.5" y="1" width="3" height="7" rx="0.5"/><rect x="10" y="1" width="3" height="12" rx="0.5"/>
          </svg>
        </button>
        <button class="view-btn" title="Chart view" @click="emit('switchView', 'chart')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,11 4,6 7,9 10,3 13,6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 看板内容 -->
    <div class="kanban-scroll">
      <div v-if="isLoading" class="kanban-empty"><n-spin /></div>
      <div v-else-if="!groupField" class="kanban-empty">
        <p style="color:#999;font-size:14px;">Select a <b>Select</b> field to group records into columns.</p>
      </div>
      <div v-else class="kanban-board">
        <!-- 每列一个状态 -->
        <div
          v-for="col in columns"
          :key="col.value"
          class="kanban-column"
          @dragover.prevent
          @dragenter.prevent="dragOverCol = col.value"
          @dragleave="onDragLeave($event, col.value)"
          @drop="onDrop(col.value)"
          :class="{ 'drag-over': dragOverCol === col.value }"
        >
          <div class="column-header">
            <span class="column-badge" :style="{ background: col.color + '22', color: col.color, borderColor: col.color + '55' }">
              {{ col.label }}
            </span>
            <span class="column-count">{{ col.records.length }}</span>
          </div>
          <div class="column-body">
            <div
              v-for="record in col.records"
              :key="record.id"
              class="kanban-card"
              draggable="true"
              @dragstart="onDragStart(record)"
              @dragend="onDragEnd"
              :class="{ dragging: draggingRecord?.id === record.id }"
              @click="openExpand(record)"
            >
              <div class="card-title">{{ cardTitle(record) || `#${record.id}` }}</div>
              <div v-if="cardBodyFields.length" class="card-fields">
                <div v-for="f in cardBodyFields" :key="f.column_name" class="card-field-row">
                  <span class="card-field-label">{{ f.title }}</span>
                  <span class="card-field-value">
                    <CellValue
                      :value="record[f.column_name]"
                      :field-type="f.field_type"
                      :select-options="f.select_options"
                    />
                  </span>
                </div>
              </div>
            </div>

            <!-- 空列占位 -->
            <div v-if="col.records.length === 0" class="column-empty">No records</div>
          </div>
        </div>

        <!-- 无值列 -->
        <div
          v-if="uncategorized.length > 0"
          class="kanban-column"
          @dragover.prevent
          @dragenter.prevent="dragOverCol = '__none__'"
          @dragleave="onDragLeave($event, '__none__')"
          @drop="onDrop('__none__')"
          :class="{ 'drag-over': dragOverCol === '__none__' }"
        >
          <div class="column-header">
            <span class="column-badge" style="background:#f0f2f5;color:#999;border-color:#e0e2e8">
              Uncategorized
            </span>
            <span class="column-count">{{ uncategorized.length }}</span>
          </div>
          <div class="column-body">
            <div
              v-for="record in uncategorized"
              :key="record.id"
              class="kanban-card"
              draggable="true"
              @dragstart="onDragStart(record)"
              @dragend="onDragEnd"
              :class="{ dragging: draggingRecord?.id === record.id }"
              @click="openExpand(record)"
            >
              <div class="card-title">{{ cardTitle(record) || `#${record.id}` }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 新增弹窗 -->
  <RecordForm
    v-model:show="showForm"
    :fields="fields"
    :record="null"
    @submit="handleFormSubmit"
  />

  <!-- 记录展开 -->
  <RowExpand
    v-if="expandRow !== null"
    v-model:show="showExpand"
    :table-name="tableName"
    :fields="fields"
    :all-rows="allRows as Record<string, unknown>[]"
    :initial-index="expandIndex"
    @refresh="invalidate"
  />

  <AppModal v-model:show="showIconPicker" title="Choose Icon" width="360px" height="auto">
    <IconPicker :current-icon="props.tableIcon ?? null" @select="onIconSelect" />
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useMessage, NButton, NSpin, NSelect } from 'naive-ui'
import { api, type FieldMeta, type RecordRow, type SelectOption } from '@/api/client'
import CellValue from './CellValue.vue'
import RecordForm from './RecordForm.vue'
import RowExpand from './RowExpand.vue'
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
const queryClient = useQueryClient()

// ── 状态 ──────────────────────────────────────────────────────
const showForm = ref(false)
const showExpand = ref(false)
const showIconPicker = ref(false)
const expandRow = ref<RecordRow | null>(null)
const expandIndex = ref(0)
const refreshing = ref(false)

const displayTitle = computed(() => props.tableTitle || props.tableName)

// ── 分组字段选择 ──────────────────────────────────────────────
const selectFields = computed(() =>
  props.fields.filter(f => f.field_type === 'select' && !f.is_hidden)
)

const selectFieldOptions = computed(() =>
  selectFields.value.map(f => ({ label: f.title, value: f.column_name }))
)

// 自动选第一个 select 字段
const groupField = ref<string | null>(null)
watch(selectFields, (fields) => {
  if (!groupField.value && fields.length > 0) {
    groupField.value = fields[0].column_name
  }
}, { immediate: true })

// 切表时重置
watch(() => props.tableName, () => { groupField.value = null })

const groupFieldMeta = computed(() =>
  props.fields.find(f => f.column_name === groupField.value) ?? null
)

const groupOptions = computed<SelectOption[]>(() =>
  (groupFieldMeta.value?.select_options ?? []) as SelectOption[]
)

// ── 数据查询（加载所有记录，最多 500 条看板用） ─────────────────
const { data, isLoading } = useQuery({
  queryKey: computed(() => ['records', props.tableName, { page_size: 500 }]),
  queryFn: () => api.getRecords(props.tableName, { page_size: 500 }),
})

const allRows = computed(() =>
  (data.value?.data.map(r => ({ ...r })) ?? []) as RecordRow[]
)

// ── 看板列数据 ─────────────────────────────────────────────────
interface KanbanColumn {
  value: string
  label: string
  color: string
  records: RecordRow[]
}

const columns = computed<KanbanColumn[]>(() => {
  if (!groupField.value) return []

  return groupOptions.value.map(opt => ({
    value: opt.value,
    label: opt.label,
    color: opt.color,
    records: allRows.value.filter(r => String(r[groupField.value!]) === opt.value),
  }))
})

const uncategorized = computed(() => {
  if (!groupField.value) return []
  const validValues = new Set(groupOptions.value.map(o => o.value))
  return allRows.value.filter(r => {
    const v = r[groupField.value!]
    return v == null || v === '' || !validValues.has(String(v))
  })
})

// ── 卡片内容 ──────────────────────────────────────────────────
const titleField = computed(() =>
  props.fields.find(f => !f.is_hidden && ['text', 'longtext', 'email'].includes(f.field_type) && f.column_name !== groupField.value)
  ?? props.fields.find(f => !f.is_hidden && f.field_type !== 'image' && f.column_name !== groupField.value)
  ?? null
)

const cardBodyFields = computed(() =>
  props.fields
    .filter(f => !f.is_hidden && f.column_name !== groupField.value && f !== titleField.value && !f.isPrimaryKey && f.column_name !== 'created_at')
    .slice(0, 3)
)

function cardTitle(record: RecordRow): string {
  if (!titleField.value) return ''
  const v = record[titleField.value.column_name]
  return v != null && v !== '' ? String(v) : ''
}

// ── 拖拽 ──────────────────────────────────────────────────────
const draggingRecord = ref<RecordRow | null>(null)
const dragOverCol = ref<string | null>(null)

function onDragStart(record: RecordRow) {
  draggingRecord.value = record
}

function onDragEnd() {
  draggingRecord.value = null
  dragOverCol.value = null
}

function onDragLeave(e: DragEvent, colValue: string) {
  // Only clear if actually leaving the column (not entering a child)
  const related = e.relatedTarget as HTMLElement | null
  const col = (e.currentTarget as HTMLElement)
  if (!related || !col.contains(related)) {
    if (dragOverCol.value === colValue) dragOverCol.value = null
  }
}

async function onDrop(targetValue: string) {
  const record = draggingRecord.value
  if (!record || !groupField.value) return

  const currentValue = String(record[groupField.value] ?? '')
  const newValue = targetValue === '__none__' ? null : targetValue

  if (currentValue === targetValue) {
    onDragEnd()
    return
  }

  // Optimistic update
  record[groupField.value] = newValue as unknown as RecordRow[string]
  onDragEnd()

  try {
    await api.updateRecord(props.tableName, record.id, { [groupField.value]: newValue })
    invalidate()
  } catch (err) {
    message.error((err as Error).message)
    invalidate()
  }
}

// ── 工具方法 ──────────────────────────────────────────────────
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

function openCreate() {
  showForm.value = true
}

async function handleFormSubmit(formData: Record<string, unknown>) {
  try {
    await api.createRecord(props.tableName, formData)
    message.success('Record added')
    invalidate()
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
    showForm.value = true
  }
}

function openExpand(record: RecordRow) {
  expandRow.value = record
  const idx = allRows.value.findIndex(r => r.id === record.id)
  expandIndex.value = idx >= 0 ? idx : 0
  showExpand.value = true
}

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
</script>

<style scoped>
.kanban-wrapper {
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
.toolbar-label { font-size: 12px; color: #888; }

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

/* 看板滚动区 */
.kanban-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 16px;
}
.kanban-empty {
  padding: 60px;
  text-align: center;
  color: #bbb;
}

/* 看板面板 */
.kanban-board {
  display: flex;
  gap: 12px;
  height: 100%;
  min-width: min-content;
}

/* 列 */
.kanban-column {
  width: 280px;
  min-width: 280px;
  background: #f5f6f8;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  transition: background 0.15s;
}
.kanban-column.drag-over {
  background: #eef1ff;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  flex-shrink: 0;
}
.column-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  border: 1px solid;
  font-weight: 600;
}
.column-count {
  font-size: 11px;
  color: #aaa;
}

.column-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.column-empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #ccc;
}

/* 卡片 */
.kanban-card {
  background: #fff;
  border: 1px solid #e8eaf0;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: grab;
  transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
  user-select: none;
}
.kanban-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  border-color: #c8cbda;
}
.kanban-card.dragging {
  opacity: 0.4;
}
.kanban-card:active {
  cursor: grabbing;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1d2e;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-fields {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.card-field-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
}
.card-field-label {
  color: #aaa;
  flex-shrink: 0;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-field-value {
  color: #555;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.spin-icon {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
