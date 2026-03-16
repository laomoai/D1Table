<template>
  <n-drawer
    v-model:show="visible"
    :width="600"
    placement="right"
    @after-leave="onClose"
  >
    <n-drawer-content :native-scrollbar="false">
      <template #header>
        <div class="expand-header">
          <span class="expand-id">ID: {{ currentRow?.id ?? '—' }}</span>
          <div class="expand-nav">
            <n-button
              size="small"
              quaternary
              :disabled="currentIndex <= 0"
              @click="navigate(-1)"
            >
              ← Previous
            </n-button>
            <n-button
              size="small"
              quaternary
              :disabled="currentIndex >= allRows.length - 1"
              @click="navigate(1)"
            >
              Next →
            </n-button>
          </div>
        </div>
      </template>

      <div v-if="currentRow" class="expand-fields">
        <div
          v-for="field in visibleFields"
          :key="field.column_name"
          class="expand-field-row"
        >
          <div class="expand-field-label">
            <span class="field-icon-sm" :style="{ color: typeColor(field.field_type) }">
              {{ typeIcon(field.field_type) }}
            </span>
            <span class="expand-field-title">{{ field.title }}</span>
          </div>
          <div class="expand-field-value">
            <!-- 编辑模式 -->
            <template v-if="editing && !field.isPrimaryKey && field.column_name !== 'created_at'">
              <!-- checkbox -->
              <n-switch
                v-if="field.field_type === 'checkbox'"
                :value="!!editData[field.column_name]"
                @update:value="(v: boolean) => editData[field.column_name] = v ? 1 : 0"
              />
              <!-- number/currency/percent -->
              <n-input-number
                v-else-if="['number', 'currency', 'percent'].includes(field.field_type)"
                :value="editData[field.column_name] as number | null"
                @update:value="(v: number | null) => editData[field.column_name] = v"
                style="width:100%"
              />
              <!-- date -->
              <n-date-picker
                v-else-if="field.field_type === 'date'"
                :value="dateToTs(editData[field.column_name])"
                @update:value="(v: number | null) => editData[field.column_name] = tsToDateStr(v)"
                type="date"
                style="width:100%"
                clearable
              />
              <!-- datetime -->
              <n-date-picker
                v-else-if="field.field_type === 'datetime'"
                :value="datetimeToTs(editData[field.column_name])"
                @update:value="(v: number | null) => editData[field.column_name] = v ? Math.floor(v / 1000) : null"
                type="datetime"
                style="width:100%"
                clearable
              />
              <!-- select -->
              <n-select
                v-else-if="field.field_type === 'select'"
                :value="editData[field.column_name] as string"
                @update:value="(v: string) => editData[field.column_name] = v"
                :options="(field.select_options ?? []).map(o => ({ label: o.label, value: o.value }))"
                placeholder="Select..."
                clearable
                style="width:100%"
              />
              <!-- longtext -->
              <n-input
                v-else-if="field.field_type === 'longtext'"
                :value="editData[field.column_name] as string"
                @update:value="(v: string) => editData[field.column_name] = v"
                type="textarea"
                :rows="4"
                style="width:100%"
              />
              <!-- email -->
              <n-input
                v-else-if="field.field_type === 'email'"
                :value="editData[field.column_name] as string"
                @update:value="(v: string) => editData[field.column_name] = v"
                placeholder="user@example.com"
                style="width:100%"
              />
              <!-- url -->
              <n-input
                v-else-if="field.field_type === 'url'"
                :value="editData[field.column_name] as string"
                @update:value="(v: string) => editData[field.column_name] = v"
                placeholder="https://"
                style="width:100%"
              />
              <!-- text/default -->
              <n-input
                v-else
                :value="editData[field.column_name] as string"
                @update:value="(v: string) => editData[field.column_name] = v"
                style="width:100%"
              />
            </template>
            <!-- 只读模式 -->
            <template v-else>
              <div class="readonly-value-wrap" :class="{ 'has-copy': isTextType(field.field_type) }">
                <CellValue
                  :value="currentRow[field.column_name]"
                  :field-type="field.field_type"
                  :select-options="field.select_options"
                  :detail="true"
                />
                <button
                  v-if="isTextType(field.field_type) && currentRow[field.column_name] != null && currentRow[field.column_name] !== ''"
                  class="copy-btn"
                  :class="{ copied: copiedCol === field.column_name }"
                  @click="copyValue(field.column_name, currentRow[field.column_name])"
                  :title="copiedCol === field.column_name ? 'Copied!' : 'Copy'"
                >{{ copiedCol === field.column_name ? '✓' : '⎘' }}</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="expand-footer">
          <template v-if="editing">
            <n-button @click="cancelEdit">Cancel</n-button>
            <n-button type="primary" :loading="saving" @click="saveEdit">Save</n-button>
          </template>
          <template v-else>
            <n-button type="primary" @click="startEdit">Edit</n-button>
          </template>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useMessage, NDrawer, NDrawerContent, NButton, NInput, NInputNumber, NSwitch, NSelect, NDatePicker } from 'naive-ui'
import { api, type FieldMeta, type FieldType } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'
import CellValue from './CellValue.vue'

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

const visibleFields = computed(() =>
  props.fields.filter(f => !f.is_hidden)
)

function navigate(dir: -1 | 1) {
  const next = currentIndex.value + dir
  if (next >= 0 && next < props.allRows.length) {
    currentIndex.value = next
    if (editing.value) cancelEdit()
  }
}

// ── 编辑模式 ──────────────────────────────────────────────────
const editing = ref(false)
const saving = ref(false)
const editData = ref<Record<string, unknown>>({})

function startEdit() {
  editData.value = { ...(currentRow.value ?? {}) }
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editData.value = {}
}

async function saveEdit() {
  if (!currentRow.value) return
  saving.value = true
  try {
    const payload: Record<string, unknown> = {}
    for (const field of visibleFields.value) {
      if (field.isPrimaryKey || field.column_name === 'created_at') continue
      const val = editData.value[field.column_name]
      payload[field.column_name] = val === '' ? null : val
    }
    await api.updateRecord(props.tableName, currentRow.value.id as number, payload)
    message.success('Record saved')
    queryClient.invalidateQueries({ queryKey: ['records', props.tableName] })
    emit('refresh')
    editing.value = false
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

function onClose() {
  editing.value = false
  editData.value = {}
}

// ── 日期转换工具（兼容数字、数字字符串、日期字符串）──────────
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

// ── 复制 ──────────────────────────────────────────────────────
const copiedCol = ref<string | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function isTextType(type: FieldType): boolean {
  return ['text', 'longtext', 'email', 'url'].includes(type)
}

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

// ── 类型图标 & 颜色 ────────────────────────────────────────────
function typeIcon(type: FieldType): string {
  const map: Record<string, string> = {
    text: 'T', longtext: '¶', number: '#', currency: '¥', percent: '%',
    email: '@', url: '🔗', date: '📅', datetime: '🕐', checkbox: '☑', select: '◉',
  }
  return map[type] ?? 'T'
}

function typeColor(type: FieldType): string {
  const map: Record<string, string> = {
    text: '#666', longtext: '#888', number: '#4f6ef7', currency: '#18a058', percent: '#f0a020',
    email: '#00adb5', url: '#4f6ef7', date: '#8a2be2', datetime: '#d03050', checkbox: '#18a058', select: '#f0a020',
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
.expand-id {
  font-size: 14px;
  font-weight: 600;
  color: #555;
}
.expand-nav {
  display: flex;
  gap: 4px;
}
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
.expand-field-title {
  font-size: 13px;
  color: #666;
  font-weight: 500;
}
.expand-field-value {
  font-size: 13px;
  color: #333;
  min-height: 28px;
  display: flex;
  align-items: flex-start;
  padding-top: 5px;
  word-break: break-word;
}
.readonly-value-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.copy-btn {
  flex-shrink: 0;
  background: none;
  border: 1px solid #e0e2ea;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 13px;
  color: #aaa;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1.6;
}
.expand-field-row:hover .copy-btn { opacity: 1; }
.copy-btn:hover { color: #4f6ef7; border-color: #4f6ef7; }
.copy-btn.copied { color: #18a058; border-color: #18a058; opacity: 1; }
.expand-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
