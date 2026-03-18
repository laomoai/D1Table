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
            <!-- 只读字段（主键、created_at）-->
            <template v-if="field.isPrimaryKey || field.column_name === 'created_at'">
              <div class="readonly-value-wrap">
                <CellValue
                  :value="currentRow[field.column_name]"
                  :field-type="field.field_type"
                  :select-options="field.select_options"
                  :detail="true"
                />
              </div>
            </template>

            <!-- 即时保存：select -->
            <n-select
              v-else-if="field.field_type === 'select'"
              :value="currentRow[field.column_name] as string"
              @update:value="(v: string) => saveField(field.column_name, v)"
              :options="(field.select_options ?? []).map(o => ({ label: o.label, value: o.value }))"
              :loading="savingField === field.column_name"
              placeholder="Select..."
              clearable
              style="width:100%"
            />

            <!-- 即时保存：checkbox -->
            <n-switch
              v-else-if="field.field_type === 'checkbox'"
              :value="!!currentRow[field.column_name]"
              :loading="savingField === field.column_name"
              @update:value="(v: boolean) => saveField(field.column_name, v ? 1 : 0)"
            />

            <!-- 即时保存：date -->
            <n-date-picker
              v-else-if="field.field_type === 'date'"
              :value="dateToTs(currentRow[field.column_name])"
              @update:value="(v: number | null) => saveField(field.column_name, tsToDateStr(v))"
              type="date"
              style="width:100%"
              clearable
            />

            <!-- 即时保存：datetime -->
            <n-date-picker
              v-else-if="field.field_type === 'datetime'"
              :value="datetimeToTs(currentRow[field.column_name])"
              @update:value="(v: number | null) => saveField(field.column_name, v ? Math.floor(v / 1000) : null)"
              type="datetime"
              style="width:100%"
              clearable
            />

            <!-- blur 保存：number/currency/percent -->
            <n-input-number
              v-else-if="['number', 'currency', 'percent'].includes(field.field_type)"
              :value="drafts[field.column_name] as number | null"
              @update:value="(v: number | null) => drafts[field.column_name] = v"
              @blur="saveField(field.column_name, drafts[field.column_name])"
              style="width:100%"
            />

            <!-- blur 保存：longtext -->
            <n-input
              v-else-if="field.field_type === 'longtext'"
              :value="drafts[field.column_name] as string"
              @update:value="(v: string) => drafts[field.column_name] = v"
              @blur="saveField(field.column_name, drafts[field.column_name])"
              type="textarea"
              :rows="4"
              style="width:100%"
            />

            <!-- blur 保存：email -->
            <n-input
              v-else-if="field.field_type === 'email'"
              :value="drafts[field.column_name] as string"
              @update:value="(v: string) => drafts[field.column_name] = v"
              @blur="saveField(field.column_name, drafts[field.column_name])"
              placeholder="user@example.com"
              style="width:100%"
            />

            <!-- blur 保存：url -->
            <n-input
              v-else-if="field.field_type === 'url'"
              :value="drafts[field.column_name] as string"
              @update:value="(v: string) => drafts[field.column_name] = v"
              @blur="saveField(field.column_name, drafts[field.column_name])"
              placeholder="https://"
              style="width:100%"
            />

            <!-- blur 保存：text/default -->
            <n-input
              v-else
              :value="drafts[field.column_name] as string"
              @update:value="(v: string) => drafts[field.column_name] = v"
              @blur="saveField(field.column_name, drafts[field.column_name])"
              style="width:100%"
            />
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
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

// ── 文本字段草稿（用于 blur 保存，避免每次按键请求）──────────
const drafts = ref<Record<string, unknown>>({})

// 切换行时重置草稿
watch(currentRow, (row) => {
  if (!row) { drafts.value = {}; return }
  const d: Record<string, unknown> = {}
  for (const f of visibleFields.value) {
    if (!f.isPrimaryKey && f.column_name !== 'created_at') {
      d[f.column_name] = row[f.column_name]
    }
  }
  drafts.value = d
}, { immediate: true })

function navigate(dir: -1 | 1) {
  const next = currentIndex.value + dir
  if (next >= 0 && next < props.allRows.length) {
    currentIndex.value = next
  }
}

// ── 单字段保存 ──────────────────────────────────────────────
const savingField = ref<string | null>(null)

async function saveField(columnName: string, value: unknown) {
  if (!currentRow.value) return
  // 值未变化跳过
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
    // 保存失败时回滚草稿
    drafts.value[columnName] = currentRow.value[columnName]
  } finally {
    savingField.value = null
  }
}

function onClose() {
  drafts.value = {}
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
</style>
