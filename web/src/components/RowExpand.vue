<template>
  <n-drawer
    v-model:show="visible"
    :width="drawerWidth"
    placement="right"
    @after-leave="onClose"
  >
    <n-drawer-content :native-scrollbar="false">
      <template #header>
        <div class="expand-header">
          <span class="expand-id">ID: {{ currentRow?.id ?? '—' }}</span>
          <div class="expand-nav">
            <n-button size="small" quaternary :disabled="currentIndex <= 0" @click="navigate(-1)">
              ← Previous
            </n-button>
            <n-button size="small" quaternary :disabled="currentIndex >= allRows.length - 1" @click="navigate(1)">
              Next →
            </n-button>
          </div>
        </div>
      </template>

      <div v-if="currentRow" class="expand-fields">
        <div v-for="field in visibleFields" :key="field.column_name" class="expand-field-row">
          <div class="expand-field-label">
            <span class="field-icon-sm" :style="{ color: typeColor(field.field_type) }">
              {{ typeIcon(field.field_type) }}
            </span>
            <span class="expand-field-title">{{ field.title }}</span>
          </div>

          <div class="expand-field-value">
            <!-- 永久只读：主键、created_at -->
            <template v-if="field.isPrimaryKey || field.column_name === 'created_at'">
              <div class="readonly-value-wrap">
                <CellValue :value="currentRow[field.column_name]" :field-type="field.field_type" :select-options="field.select_options" :detail="true" />
              </div>
            </template>

            <!-- 即时交互：image -->
            <template v-else-if="field.field_type === 'image'">
              <ImageUpload
                :value="(currentRow[field.column_name] as string) ?? null"
                @update:value="(v) => saveField(field.column_name, v)"
                style="width:100%"
              />
            </template>

            <!-- 即时交互：select -->
            <template v-else-if="field.field_type === 'select'">
              <n-select
                :value="currentRow[field.column_name] as string"
                @update:value="(v: string) => saveField(field.column_name, v)"
                :options="(field.select_options ?? []).map(o => ({ label: o.label, value: o.value }))"
                :loading="savingField === field.column_name"
                placeholder="Select..."
                clearable
                style="width:100%"
              />
            </template>

            <!-- 即时交互：checkbox -->
            <template v-else-if="field.field_type === 'checkbox'">
              <n-switch
                :value="!!currentRow[field.column_name]"
                :loading="savingField === field.column_name"
                @update:value="(v: boolean) => saveField(field.column_name, v ? 1 : 0)"
              />
            </template>

            <!-- 其他可编辑字段：hover 显示操作按钮，点编辑进入 inline 编辑 -->
            <template v-else>
              <!-- 只读展示 -->
              <template v-if="editingField !== field.column_name">
                <div class="editable-value-wrap" :class="{ 'is-longtext': field.field_type === 'longtext' }">
                  <!-- 内容区 + 折叠按钮（纵向排列） -->
                  <div class="editable-content-col">
                    <div
                      class="editable-display"
                      :class="{ 'longtext-collapsed': isLongtextTruncated(field.column_name) && !expandedLongtext.has(field.column_name) }"
                    >
                      <CellValue :value="currentRow[field.column_name]" :field-type="field.field_type" :select-options="field.select_options" :detail="true" />
                    </div>
                    <button
                      v-if="isLongtextTruncated(field.column_name)"
                      class="longtext-toggle"
                      @click="toggleLongtext(field.column_name)"
                    >{{ expandedLongtext.has(field.column_name) ? '收起 ▲' : '展开 ▼' }}</button>
                  </div>
                  <!-- 操作按钮（横向，hover 显示） -->
                  <div class="field-actions">
                    <button class="field-btn" @click="startEdit(field.column_name)" title="Edit">✎</button>
                    <button
                      v-if="currentRow[field.column_name] != null && currentRow[field.column_name] !== ''"
                      class="field-btn"
                      :class="{ copied: copiedCol === field.column_name }"
                      @click="copyValue(field.column_name, currentRow[field.column_name])"
                      :title="copiedCol === field.column_name ? 'Copied!' : 'Copy'"
                    >{{ copiedCol === field.column_name ? '✓' : '⎘' }}</button>
                  </div>
                </div>
              </template>

              <!-- 编辑中 -->
              <template v-else>
                <div style="width:100%">
                  <!-- number/currency/percent -->
                  <n-input-number
                    v-if="['number', 'currency', 'percent'].includes(field.field_type)"
                    ref="activeInputRef"
                    :value="draft as number | null"
                    @update:value="(v: number | null) => draft = v"
                    @blur="commitEdit(field.column_name)"
                    @keyup.enter="commitEdit(field.column_name)"
                    @keyup.escape="cancelEdit"
                    style="width:100%"
                  />
                  <!-- date -->
                  <n-date-picker
                    v-else-if="field.field_type === 'date'"
                    :value="dateToTs(draft)"
                    @update:value="(v: number | null) => { draft = tsToDateStr(v); commitEdit(field.column_name) }"
                    type="date"
                    style="width:100%"
                    clearable
                  />
                  <!-- datetime -->
                  <n-date-picker
                    v-else-if="field.field_type === 'datetime'"
                    :value="datetimeToTs(draft)"
                    @update:value="(v: number | null) => { draft = v ? Math.floor(v / 1000) : null; commitEdit(field.column_name) }"
                    type="datetime"
                    style="width:100%"
                    clearable
                  />
                  <!-- longtext 或内容很长的 text：多行 textarea -->
                  <n-input
                    v-else-if="field.field_type === 'longtext' || isLongtextTruncated(field.column_name)"
                    ref="activeInputRef"
                    :value="draft as string"
                    @update:value="(v: string) => draft = v"
                    @blur="commitEdit(field.column_name)"
                    @keyup.escape="cancelEdit"
                    type="textarea"
                    :autosize="{ minRows: 4, maxRows: 16 }"
                    style="width:100%"
                  />
                  <!-- text/email/url/default：单行 -->
                  <n-input
                    v-else
                    ref="activeInputRef"
                    :value="draft as string"
                    @update:value="(v: string) => draft = v"
                    @blur="commitEdit(field.column_name)"
                    @keyup.enter="commitEdit(field.column_name)"
                    @keyup.escape="cancelEdit"
                    :placeholder="field.field_type === 'email' ? 'user@example.com' : field.field_type === 'url' ? 'https://' : ''"
                    style="width:100%"
                  />
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useMessage, NDrawer, NDrawerContent, NButton, NInput, NInputNumber, NSwitch, NSelect, NDatePicker } from 'naive-ui'
import { api, type FieldMeta, type FieldType } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'
import CellValue from './CellValue.vue'
import ImageUpload from './ImageUpload.vue'

const props = defineProps<{
  tableName: string
  fields: FieldMeta[]
  allRows: Record<string, unknown>[]
  initialIndex: number
}>()

const emit = defineEmits<{ refresh: [] }>()
const visible = defineModel<boolean>('show', { default: false })

const message = useMessage()
const queryClient = useQueryClient()

const currentIndex = ref(props.initialIndex)
watch(() => props.initialIndex, (v) => { currentIndex.value = v })

const currentRow = computed(() => props.allRows[currentIndex.value] ?? null)
const visibleFields = computed(() => props.fields.filter(f => !f.is_hidden))

// ── 抽屉宽度：50vw，最小 480px ──────────────────────────────
const drawerWidth = ref(Math.max(480, window.innerWidth * 0.5))
function updateDrawerWidth() { drawerWidth.value = Math.max(480, window.innerWidth * 0.5) }
onMounted(() => window.addEventListener('resize', updateDrawerWidth))

// ── 长文本折叠 ───────────────────────────────────────────────
const LONGTEXT_COLLAPSE_LINES = 4
const expandedLongtext = ref(new Set<string>())

function isLongtextTruncated(columnName: string): boolean {
  const val = currentRow.value?.[columnName]
  if (!val) return false
  const text = String(val)
  return text.split('\n').length > LONGTEXT_COLLAPSE_LINES || text.length > 120
}

function toggleLongtext(columnName: string) {
  const s = new Set(expandedLongtext.value)
  if (s.has(columnName)) s.delete(columnName)
  else s.add(columnName)
  expandedLongtext.value = s
}

// 切换行时重置展开状态
watch(currentIndex, () => { expandedLongtext.value = new Set() })

function navigate(dir: -1 | 1) {
  const next = currentIndex.value + dir
  if (next >= 0 && next < props.allRows.length) {
    cancelEdit()
    currentIndex.value = next
  }
}

// ── 单字段即时保存（select/checkbox）────────────────────────
const savingField = ref<string | null>(null)

async function saveField(columnName: string, value: unknown) {
  if (!currentRow.value) return
  if (value === currentRow.value[columnName]) return
  savingField.value = columnName
  try {
    await api.updateRecord(props.tableName, currentRow.value.id as number, {
      [columnName]: value === '' ? null : value,
    })
    queryClient.invalidateQueries({ queryKey: ['records', props.tableName] })
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    savingField.value = null
  }
}

// ── 单字段 inline 编辑（其他类型）───────────────────────────
const editingField = ref<string | null>(null)
const draft = ref<unknown>(null)
const activeInputRef = ref<{ focus?: () => void } | null>(null)

function startEdit(columnName: string) {
  editingField.value = columnName
  draft.value = currentRow.value?.[columnName] ?? null
  nextTick(() => {
    if (activeInputRef.value?.focus) activeInputRef.value.focus()
  })
}

function cancelEdit() {
  editingField.value = null
  draft.value = null
}

async function commitEdit(columnName: string) {
  if (!currentRow.value || editingField.value !== columnName) return
  const value = draft.value
  editingField.value = null
  draft.value = null
  await saveField(columnName, value)
}

function onClose() {
  cancelEdit()
}

// ── 复制 ────────────────────────────────────────────────────
const copiedCol = ref<string | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
  window.removeEventListener('resize', updateDrawerWidth)
})

async function copyValue(colName: string, value: unknown) {
  try {
    await navigator.clipboard.writeText(String(value ?? ''))
    copiedCol.value = colName
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedCol.value = null }, 1500)
  } catch {
    message.error('Copy failed')
  }
}

// ── 日期转换工具 ────────────────────────────────────────────
function dateToTs(v: unknown): number | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) return (n < 1e10 ? n * 1000 : n)
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).getTime()
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

function tsToDateStr(ts: number | null): string | null {
  if (!ts) return null
  return new Date(ts).toISOString().slice(0, 10)
}

function datetimeToTs(v: unknown): number | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) return (n < 1e10 ? n * 1000 : n)
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d.getTime()
}

// ── 类型图标 & 颜色 ─────────────────────────────────────────
function typeIcon(type: FieldType): string {
  const map: Record<string, string> = {
    text: 'T', longtext: '¶', number: '#', currency: '¥', percent: '%',
    email: '@', url: '🔗', date: '📅', datetime: '🕐', checkbox: '☑', select: '◉', image: '🖼',
  }
  return map[type] ?? 'T'
}

function typeColor(type: FieldType): string {
  const map: Record<string, string> = {
    text: '#666', longtext: '#888', number: '#4f6ef7', currency: '#18a058', percent: '#f0a020',
    email: '#00adb5', url: '#4f6ef7', date: '#8a2be2', datetime: '#d03050', checkbox: '#18a058', select: '#f0a020', image: '#e91e8c',
  }
  return map[type] ?? '#666'
}
</script>

<style scoped>
.expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.expand-id { font-size: 14px; font-weight: 600; color: #555; }
.expand-nav { display: flex; gap: 4px; }

.expand-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
}
.expand-field-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f2f5;
}
.expand-field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
}
.field-icon-sm {
  font-size: 12px;
  width: 18px;
  text-align: center;
  font-weight: 700;
  flex-shrink: 0;
}
.expand-field-title { font-size: 13px; color: #666; font-weight: 500; }

.expand-field-value {
  font-size: 13px;
  color: #333;
  min-height: 28px;
  display: flex;
  align-items: flex-start;
  padding-top: 5px;
  word-break: break-word;
  width: 100%;
}

.readonly-value-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
}

/* hover 编辑区域 */
.editable-value-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-height: 28px;
}
/* 内容列（内容 + 折叠按钮纵向排列） */
.editable-content-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.editable-display {
  width: 100%;
  min-width: 0;
}
.field-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}
.expand-field-row:hover .field-actions { opacity: 1; }

.field-btn {
  background: none;
  border: 1px solid #e0e2ea;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 13px;
  color: #aaa;
  cursor: pointer;
  line-height: 1.6;
  transition: color 0.15s, border-color 0.15s;
}
.field-btn:hover { color: #4f6ef7; border-color: #4f6ef7; }
.field-btn.copied { color: #18a058; border-color: #18a058; }

/* longtext 折叠 */
.longtext-collapsed {
  max-height: calc(1.6em * 4);
  overflow: hidden;
  position: relative;
}
.longtext-collapsed::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 24px;
  background: linear-gradient(transparent, #fff);
  pointer-events: none;
}
.longtext-toggle {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  color: #4f6ef7;
  cursor: pointer;
  text-align: left;
  line-height: 1.8;
}
.longtext-toggle:hover { text-decoration: underline; }
</style>
