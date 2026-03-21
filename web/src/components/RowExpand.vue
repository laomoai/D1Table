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
            <button class="copy-record-btn" :class="{ copied: recordCopied }" @click="copyRecord" :title="recordCopied ? 'Copied!' : 'Copy record'">
              {{ recordCopied ? '✓' : '⎘' }}
            </button>
            <div class="font-size-switcher">
              <button class="fs-btn" :class="{ active: fontSize === 'small' }" @click="setFontSize('small')" title="Small">A</button>
              <button class="fs-btn fs-btn--md" :class="{ active: fontSize === 'medium' }" @click="setFontSize('medium')" title="Medium">A</button>
              <button class="fs-btn fs-btn--lg" :class="{ active: fontSize === 'large' }" @click="setFontSize('large')" title="Large">A</button>
            </div>
            <n-button size="small" quaternary :disabled="currentIndex <= 0" @click="navigate(-1)">
              ← Previous
            </n-button>
            <n-button size="small" quaternary :disabled="currentIndex >= allRows.length - 1" @click="navigate(1)">
              Next →
            </n-button>
          </div>
        </div>
      </template>

      <div v-if="currentRow" class="expand-fields" :class="`fs-${fontSize}`">
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

            <!-- 即时交互：link (record reference) -->
            <template v-else-if="field.field_type === 'link'">
              <div class="link-field-wrap">
                <a
                  v-if="parseLinkValue(currentRow[field.column_name])"
                  class="link-field-pill"
                  @click.prevent="goToLinkedRecord(field)"
                >{{ parseLinkValue(currentRow[field.column_name])!.title }}</a>
                <div class="link-field-actions">
                  <button class="note-field-btn" @click="openLinkPicker(field)" :title="currentRow[field.column_name] ? 'Change' : 'Select record'">
                    {{ currentRow[field.column_name] ? 'Change' : 'Select record' }}
                  </button>
                  <button
                    v-if="currentRow[field.column_name]"
                    class="note-field-btn danger"
                    @click="saveField(field.column_name, null)"
                    title="Clear"
                  >Clear</button>
                </div>
              </div>
            </template>

            <!-- 即时交互：note (stored as "id|title|icon") -->
            <template v-else-if="field.field_type === 'note'">
              <div class="note-field-wrap">
                <a
                  v-if="currentRow[field.column_name] && decodeNoteValue(currentRow[field.column_name])"
                  class="note-field-link"
                  :href="`/notes/${decodeNoteValue(currentRow[field.column_name])!.id}`"
                  @click.prevent="$router.push(`/notes/${decodeNoteValue(currentRow[field.column_name])!.id}`)"
                >{{ decodeNoteValue(currentRow[field.column_name])!.icon || '📄' }} {{ decodeNoteValue(currentRow[field.column_name])!.title }}</a>
                <div class="note-field-actions">
                  <button class="note-field-btn" @click="openNotePicker(field.column_name)" title="Select note">
                    {{ currentRow[field.column_name] ? 'Change' : 'Select note' }}
                  </button>
                  <button
                    v-if="currentRow[field.column_name]"
                    class="note-field-btn danger"
                    @click="saveField(field.column_name, null)"
                    title="Clear"
                  >Clear</button>
                </div>
              </div>
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

  <!-- Link record picker modal -->
  <n-modal v-model:show="showLinkPicker" :mask-closable="true">
    <div class="note-picker-modal">
      <div class="np-header">
        <span class="np-title">Select a record</span>
        <button class="np-close" @click="showLinkPicker = false">×</button>
      </div>
      <div class="np-search">
        <input v-model="linkPickerSearch" class="np-input" placeholder="Search records..." @input="debouncedSearchLinks" />
      </div>
      <div class="np-list">
        <div v-if="linkPickerLoading" class="np-empty" style="padding:20px;text-align:center"><n-spin size="small" /></div>
        <div v-else-if="!linkPickerResults.length" class="np-empty">No records found</div>
        <div
          v-for="item in linkPickerResults"
          :key="item.id"
          class="np-item"
          @click="pickLink(item)"
        >
          <span class="np-icon">📋</span>
          <span class="np-name">{{ item.title }}</span>
          <span style="color:#aaa;font-size:11px;margin-left:auto">#{{ item.id }}</span>
        </div>
      </div>
    </div>
  </n-modal>

  <!-- Note picker modal -->
  <n-modal v-model:show="showNotePicker" :mask-closable="true">
    <div class="note-picker-modal">
      <div class="np-header">
        <span class="np-title">Select a note</span>
        <button class="np-close" @click="showNotePicker = false">×</button>
      </div>
      <div class="np-search">
        <input v-model="notePickerSearch" class="np-input" placeholder="Search notes..." />
      </div>
      <div class="np-list">
        <div v-if="!allNotes" class="np-empty" style="padding:20px;text-align:center"><n-spin size="small" /></div>
        <div v-else-if="!filteredPickerNotes.length" class="np-empty">No notes found</div>
        <div
          v-for="item in filteredPickerNotes"
          :key="item.note.id"
          class="np-item"
          :style="{ paddingLeft: `${10 + item.depth * 20}px` }"
          @click="pickNote(item.note.id)"
        >
          <span
            v-if="item.hasChildren"
            class="np-arrow"
            :class="{ expanded: pickerExpanded.has(item.note.id) }"
            @click.stop="togglePickerExpand(item.note.id)"
          >›</span>
          <span v-else class="np-arrow-ph" />
          <span class="np-icon">{{ item.note.icon || (item.hasChildren ? '📁' : '📄') }}</span>
          <span class="np-name">{{ item.note.title || 'Untitled' }}</span>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useMessage, NDrawer, NDrawerContent, NButton, NInput, NInputNumber, NSwitch, NSelect, NDatePicker, NModal, NSpin } from 'naive-ui'
import { api, type FieldMeta, type FieldType, type LinkValue } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'
import CellValue from './CellValue.vue'
import ImageUpload from './ImageUpload.vue'
import { decodeNoteValue, encodeNoteValue } from '@/utils/noteValue'
import { useNoteTree, type NoteTreeNode } from '@/utils/useNoteTree'

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

// ── 字体大小 ──────────────────────────────────────────────────
type FontSize = 'small' | 'medium' | 'large'
const fontSize = ref<FontSize>((localStorage.getItem('d1table_detail_font_size') as FontSize) || 'medium')

function setFontSize(size: FontSize) {
  fontSize.value = size
  localStorage.setItem('d1table_detail_font_size', size)
}

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

// ── 复制整条记录 ─────────────────────────────────────────────
const recordCopied = ref(false)
let recordCopyTimer: ReturnType<typeof setTimeout> | null = null

async function copyRecord() {
  if (!currentRow.value) return
  const lines: string[] = []
  for (const field of visibleFields.value) {
    const val = currentRow.value[field.column_name]
    const label = field.title
    let display = ''

    if (val == null || val === '') {
      display = '—'
    } else if (field.field_type === 'checkbox') {
      display = val ? '✓ Yes' : '✗ No'
    } else if (field.field_type === 'select' && field.select_options) {
      const opt = (field.select_options as Array<{ value: string; label: string }>).find(o => o.value === String(val))
      display = opt?.label ?? String(val)
    } else if (field.field_type === 'link') {
      const linked = parseLinkValue(val)
      display = linked ? linked.title : String(val)
    } else if (field.field_type === 'note') {
      const note = decodeNoteValue(val)
      display = note ? note.title : String(val)
    } else if (field.field_type === 'image') {
      try {
        const img = JSON.parse(String(val)) as { name?: string }
        display = img.name ?? '[Image]'
      } catch { display = '[Image]' }
    } else if (field.field_type === 'currency') {
      display = '¥' + Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
    } else if (field.field_type === 'percent') {
      display = Number(val).toLocaleString('zh-CN') + '%'
    } else {
      display = String(val)
    }

    lines.push(`${label}: ${display}`)
  }

  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    recordCopied.value = true
    if (recordCopyTimer) clearTimeout(recordCopyTimer)
    recordCopyTimer = setTimeout(() => { recordCopied.value = false }, 2000)
  } catch {
    message.error('Copy failed')
  }
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
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function datetimeToTs(v: unknown): number | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) return (n < 1e10 ? n * 1000 : n)
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d.getTime()
}


// ── Link record picker ───────────────────────────────────────
const showLinkPicker = ref(false)
const linkPickerSearch = ref('')
const linkPickerField = ref<string | null>(null)
const linkPickerTable = ref<string | null>(null)
const linkPickerResults = ref<LinkValue[]>([])
const linkPickerLoading = ref(false)

function parseLinkValue(val: unknown): LinkValue | null {
  if (!val) return null
  try {
    const parsed = JSON.parse(String(val))
    if (parsed && typeof parsed === 'object' && parsed.id) return parsed as LinkValue
  } catch {}
  // Fallback: raw ID (number or string) — not yet resolved
  return { id: String(val), title: `#${val}` }
}

function getLinkTable(field: FieldMeta): string | null {
  if (!field.select_options) return null
  const config = field.select_options as unknown as { link_table?: string }
  return config.link_table ?? null
}

function goToLinkedRecord(field: FieldMeta) {
  const val = parseLinkValue(currentRow.value?.[field.column_name])
  const linkTable = getLinkTable(field)
  if (!val || !linkTable) return
  // Navigate using router
  import('@/router').then(m => m.default.push(`/tables/${linkTable}?highlight=${val.id}`))
}

async function openLinkPicker(field: FieldMeta) {
  const linkTable = getLinkTable(field)
  if (!linkTable) return
  linkPickerField.value = field.column_name
  linkPickerTable.value = linkTable
  linkPickerSearch.value = ''
  linkPickerResults.value = []
  linkPickerLoading.value = true
  showLinkPicker.value = true
  try {
    linkPickerResults.value = await api.searchRecords(linkTable)
  } finally {
    linkPickerLoading.value = false
  }
}

let linkSearchTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSearchLinks() {
  if (linkSearchTimer) clearTimeout(linkSearchTimer)
  linkSearchTimer = setTimeout(async () => {
    if (!linkPickerTable.value) return
    linkPickerLoading.value = true
    try {
      linkPickerResults.value = await api.searchRecords(linkPickerTable.value, linkPickerSearch.value)
    } finally {
      linkPickerLoading.value = false
    }
  }, 300)
}

function pickLink(item: LinkValue) {
  if (linkPickerField.value) {
    // Save the raw ID — backend will resolve to {id, title} on next fetch
    saveField(linkPickerField.value, item.id)
  }
  showLinkPicker.value = false
}

// ── Note picker (uses shared composable) ────────────────────
const showNotePicker = ref(false)
const notePickerSearch = ref('')
const notePickerField = ref<string | null>(null)
const pickerExpanded = ref(new Set<string>())

const { treeData: allNotes, buildTreeList, searchNotes, getNoteTitle } = useNoteTree()
const pickerTreeNotes = buildTreeList(pickerExpanded)
const pickerSearchNotes = searchNotes(notePickerSearch)
const filteredPickerNotes = computed<NoteTreeNode[]>(() =>
  notePickerSearch.value.trim() ? pickerSearchNotes.value : pickerTreeNotes.value
)

function togglePickerExpand(id: string) {
  const s = new Set(pickerExpanded.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  pickerExpanded.value = s
}

function openNotePicker(columnName: string) {
  notePickerField.value = columnName
  notePickerSearch.value = ''
  showNotePicker.value = true
}

function pickNote(noteId: string) {
  if (notePickerField.value) {
    const note = (allNotes.value ?? []).find(n => n.id === noteId)
    saveField(notePickerField.value, encodeNoteValue(noteId, note?.title || 'Untitled', note?.icon || ''))
  }
  showNotePicker.value = false
}

// ── 类型图标 & 颜色 ─────────────────────────────────────────
function typeIcon(type: FieldType): string {
  const map: Record<string, string> = {
    text: 'T', longtext: '¶', number: '#', currency: '¥', percent: '%',
    email: '@', url: '🔗', date: '📅', datetime: '🕐', checkbox: '☑', select: '◉', image: '🖼', note: '📄', link: '🔗',
  }
  return map[type] ?? 'T'
}

function typeColor(type: FieldType): string {
  const map: Record<string, string> = {
    text: '#666', longtext: '#888', number: '#4f6ef7', currency: '#18a058', percent: '#f0a020',
    email: '#00adb5', url: '#4f6ef7', date: '#8a2be2', datetime: '#d03050', checkbox: '#18a058', select: '#f0a020', image: '#e91e8c', note: '#8a6d3b', link: '#4f6ef7',
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
.expand-nav { display: flex; gap: 4px; align-items: center; }

.copy-record-btn {
  background: none;
  border: 1px solid #e0e2ea;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 14px;
  color: #aaa;
  cursor: pointer;
  line-height: 1.4;
  transition: color 0.15s, border-color 0.15s;
}
.copy-record-btn:hover { color: #4f6ef7; border-color: #4f6ef7; }
.copy-record-btn.copied { color: #18a058; border-color: #18a058; }

/* 字体大小切换 */
.font-size-switcher {
  display: flex;
  gap: 1px;
  border: 1px solid #e0e2e8;
  border-radius: 4px;
  padding: 1px;
  background: #f7f8fa;
  margin-right: 4px;
}
.fs-btn {
  background: none;
  border: none;
  border-radius: 3px;
  width: 22px;
  height: 20px;
  cursor: pointer;
  color: #aaa;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.1s, color 0.1s;
}
.fs-btn--md { font-size: 12px; }
.fs-btn--lg { font-size: 14px; }
.fs-btn:hover { color: #666; }
.fs-btn.active { background: #fff; color: #4f6ef7; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

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

/* 字体大小变体 */
.expand-fields.fs-small .expand-field-title { font-size: 11px; }
.expand-fields.fs-small .expand-field-value { font-size: 12px; }
.expand-fields.fs-small .expand-field-row { padding: 5px 0; gap: 8px; }
.expand-fields.fs-small .expand-field-label { padding-top: 4px; }
.expand-fields.fs-large .expand-field-title { font-size: 14px; }
.expand-fields.fs-large .expand-field-value { font-size: 15px; }
.expand-fields.fs-large .expand-field-row { padding: 10px 0; gap: 14px; }

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
/* Link field */
.link-field-wrap { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.link-field-pill {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 3px 10px 3px 8px; background: rgba(79, 110, 247, 0.08);
  border: 1px solid rgba(79, 110, 247, 0.25); border-radius: 4px;
  font-size: 13px; color: #4f6ef7; text-decoration: none; font-weight: 500;
  cursor: pointer; max-width: fit-content;
}
.link-field-pill:hover { background: rgba(79, 110, 247, 0.14); }
.link-field-actions { display: flex; gap: 6px; }
/* Note field */
.note-field-wrap { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.note-field-link {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 3px 10px 3px 6px; background: rgba(55,53,47,0.06);
  border: 1px solid #e9e9e7; border-radius: 4px;
  font-size: 13px; color: #37352f; text-decoration: none; font-weight: 500;
}
.note-field-link:hover { background: rgba(55,53,47,0.1); }
.note-field-actions { display: flex; gap: 6px; }
.note-field-btn {
  background: none; border: 1px solid #e9e9e7; border-radius: 4px;
  padding: 3px 10px; font-size: 12px; color: #787774; cursor: pointer; transition: all 0.1s;
}
.note-field-btn:hover { background: rgba(55,53,47,0.06); color: #37352f; }
.note-field-btn.danger { color: #e03e3e; border-color: #f0d0d0; }
.note-field-btn.danger:hover { background: rgba(224,62,62,0.06); }
/* Note picker modal */
.note-picker-modal {
  background: #fff; border-radius: 8px; width: 400px; max-height: 480px;
  display: flex; flex-direction: column; overflow: hidden;
}
.np-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 8px;
}
.np-title { font-size: 15px; font-weight: 600; color: #37352f; }
.np-close {
  background: none; border: none; font-size: 20px; color: #a3a19d;
  cursor: pointer; padding: 0 2px; line-height: 1; border-radius: 3px;
}
.np-close:hover { color: #37352f; background: rgba(55,53,47,0.06); }
.np-search { padding: 8px 20px; }
.np-input {
  width: 100%; padding: 8px 12px; border: 1px solid #e9e9e7;
  border-radius: 4px; font-size: 13px; outline: none; color: #37352f;
}
.np-input:focus { border-color: #b3b0ab; }
.np-list { flex: 1; overflow-y: auto; padding: 0 12px 12px; }
.np-empty { padding: 20px; text-align: center; color: #a3a19d; font-size: 13px; }
.np-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 4px; cursor: pointer; transition: background 0.1s;
  font-size: 13px; color: #37352f;
}
.np-item:hover { background: rgba(55,53,47,0.06); }
.np-arrow {
  font-size: 11px; color: #a3a19d; cursor: pointer;
  width: 14px; text-align: center; flex-shrink: 0;
  transition: transform 0.12s; display: inline-block;
}
.np-arrow.expanded { transform: rotate(90deg); }
.np-arrow:hover { color: #37352f; }
.np-arrow-ph { width: 14px; flex-shrink: 0; }
.np-icon { font-size: 14px; flex-shrink: 0; }
.np-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
