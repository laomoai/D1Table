<template>
  <n-modal
    v-model:show="visible"
    :title="isEdit ? 'Edit Record' : 'New Record'"
    preset="card"
    style="width: 560px;"
    :mask-closable="false"
  >
    <n-form
      ref="formRef"
      :model="formData"
      label-placement="left"
      label-width="110"
      require-mark-placement="right-hanging"
    >
      <n-form-item
        v-for="field in writableFields"
        :key="field.column_name"
        :label="field.title"
        :path="field.column_name"
        :rule="!field.nullable ? {
          required: true,
          type: ['number', 'currency', 'percent', 'datetime', 'checkbox'].includes(field.field_type) ? 'number' : 'string',
          message: `${field.title} is required`,
          trigger: ['blur', 'input', 'change']
        } : undefined"
      >
        <!-- checkbox -->
        <n-switch
          v-if="field.field_type === 'checkbox'"
          :value="!!formData[field.column_name]"
          @update:value="(v: boolean) => formData[field.column_name] = v ? 1 : 0"
        />

        <!-- number / currency / percent -->
        <n-input-number
          v-else-if="['number', 'currency', 'percent'].includes(field.field_type)"
          :value="formData[field.column_name] as number | null"
          @update:value="(v: number | null) => formData[field.column_name] = v"
          :placeholder="`Enter ${field.title}`"
          style="width: 100%;"
          :prefix="field.field_type === 'currency' ? '¥' : undefined"
          :suffix="field.field_type === 'percent' ? '%' : undefined"
        />

        <!-- date -->
        <n-date-picker
          v-else-if="field.field_type === 'date'"
          :value="dateToTs(formData[field.column_name])"
          @update:value="(v: number | null) => formData[field.column_name] = tsToDateStr(v)"
          type="date"
          style="width: 100%;"
          clearable
        />

        <!-- datetime -->
        <n-date-picker
          v-else-if="field.field_type === 'datetime'"
          :value="datetimeToTs(formData[field.column_name])"
          @update:value="(v: number | null) => formData[field.column_name] = v ? Math.floor(v / 1000) : null"
          type="datetime"
          style="width: 100%;"
          clearable
        />

        <!-- select -->
        <n-select
          v-else-if="field.field_type === 'select'"
          :value="formData[field.column_name] as string"
          @update:value="(v: string) => formData[field.column_name] = v"
          :options="(field.select_options ?? []).map(o => ({ label: o.label, value: o.value }))"
          :placeholder="`Select ${field.title}`"
          clearable
        />

        <!-- longtext -->
        <n-input
          v-else-if="field.field_type === 'longtext'"
          :value="formData[field.column_name] as string"
          @update:value="(v: string) => formData[field.column_name] = v"
          :placeholder="`Enter ${field.title}`"
          type="textarea"
          :rows="3"
        />

        <!-- email -->
        <n-input
          v-else-if="field.field_type === 'email'"
          :value="formData[field.column_name] as string"
          @update:value="(v: string) => formData[field.column_name] = v"
          placeholder="Enter email address"
          type="text"
        />

        <!-- url -->
        <n-input
          v-else-if="field.field_type === 'url'"
          :value="formData[field.column_name] as string"
          @update:value="(v: string) => formData[field.column_name] = v"
          @blur="() => { const v = formData[field.column_name] as string; if (v && !/^https?:\/\//i.test(v)) formData[field.column_name] = 'https://' + v }"
          placeholder="https://"
          type="text"
        />

        <!-- password -->
        <PasswordInput
          v-else-if="field.field_type === 'password'"
          :model-value="formData[field.column_name] as string"
          @update:model-value="(v: string) => formData[field.column_name] = v"
        />

        <!-- totp (secret key input) -->
        <n-input
          v-else-if="field.field_type === 'totp'"
          :value="formData[field.column_name] as string"
          @update:value="(v: string) => formData[field.column_name] = v"
          placeholder="Enter TOTP secret key (base32)"
          type="password"
          show-password-on="click"
        />

        <!-- link to notes (tree picker) -->
        <div v-else-if="field.field_type === 'link' && isNotesLink(field)" class="notes-link-picker">
          <div class="nlp-input-wrap">
            <span v-if="extractLinkId(formData[field.column_name])" class="nlp-pill">
              {{ getSelectedNoteTitle(field.column_name) }}
              <button class="nlp-clear" @click.stop="formData[field.column_name] = null">&times;</button>
            </span>
            <input
              v-else
              v-model="notesLinkSearch[field.column_name]"
              class="nlp-search-inline"
              placeholder="Search notes..."
            />
          </div>
          <div class="nlp-tree">
            <template v-if="!allNotes">
              <div class="nlp-empty"><n-spin size="small" /></div>
            </template>
            <template v-else-if="!getFilteredNotes(field.column_name).length">
              <div class="nlp-empty">No notes found</div>
            </template>
            <div
              v-for="item in getFilteredNotes(field.column_name)"
              :key="item.note.id"
              class="nlp-item"
              :class="{ selected: extractLinkId(formData[field.column_name]) === item.note.id }"
              :style="{ paddingLeft: `${8 + item.depth * 18}px` }"
              @click="formData[field.column_name] = item.note.id"
            >
              <span
                v-if="item.hasChildren"
                class="nlp-arrow"
                :class="{ expanded: notesLinkExpanded.has(item.note.id) }"
                @click.stop="toggleNotesLinkExpand(item.note.id)"
              >&rsaquo;</span>
              <span v-else class="nlp-arrow-ph" />
              <span class="nlp-icon">
                <IonIcon v-if="item.note.icon?.startsWith('ion:')" :name="item.note.icon.slice(4)" :size="14" />
                <IonIcon v-else :name="item.hasChildren ? 'FolderOutline' : 'DocumentOutline'" :size="14" />
              </span>
              <HoverTooltipText
                :text="item.note.title || 'Untitled'"
                class-name="nlp-name"
              />
            </div>
          </div>
        </div>

        <!-- link to regular table (select picker) -->
        <n-select
          v-else-if="field.field_type === 'link'"
          :value="extractLinkId(formData[field.column_name])"
          @update:value="(v: string | null) => formData[field.column_name] = v"
          filterable
          remote
          clearable
          :options="linkOptions[field.column_name] ?? []"
          :loading="linkLoading[field.column_name]"
          @search="(q: string) => searchLinkRecords(field, q)"
          @focus="() => { if (!linkOptions[field.column_name]?.length) searchLinkRecords(field, '') }"
          placeholder="Select record"
        />

        <!-- image -->
        <ImageUpload
          v-else-if="field.field_type === 'image'"
          :value="(formData[field.column_name] as string) ?? null"
          @update:value="(v) => formData[field.column_name] = v"
        />

        <!-- text (default) -->
        <n-input
          v-else
          :value="formData[field.column_name] as string"
          @update:value="(v: string) => formData[field.column_name] = v"
          :placeholder="`Enter ${field.title}`"
        />
      </n-form-item>
    </n-form>

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="visible = false">Cancel</n-button>
        <n-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ isEdit ? 'Save' : 'Add' }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NInputNumber, NButton,
  NSwitch, NSelect, NDatePicker, NTooltip, NSpin,
  type FormInst, type SelectOption,
} from 'naive-ui'
import type { FieldMeta, RecordRow } from '@/api/client'
import { api } from '@/api/client'
import HoverTooltipText from './HoverTooltipText.vue'
import ImageUpload from './ImageUpload.vue'
import PasswordInput from './PasswordInput.vue'
import IonIcon from './IonIcon.vue'
import { useNoteTree, type NoteTreeNode } from '@/utils/useNoteTree'

const formRef = ref<FormInst>()

const props = defineProps<{
  fields: FieldMeta[]
  record?: RecordRow | null
}>()

const emit = defineEmits<{
  submit: [data: Record<string, unknown>]
}>()

const visible = defineModel<boolean>('show', { default: false })
const submitting = ref(false)
const formData = ref<Record<string, unknown>>({})

const isEdit = computed(() => !!props.record)

// 可写字段：排除主键和自动列
const writableFields = computed(() =>
  props.fields.filter(
    f => !f.isPrimaryKey &&
         f.column_name !== 'created_at' &&
         !f.is_hidden &&
         !(f.defaultValue?.includes('('))
  )
)

function resetPickerState() {
  notesLinkExpanded.value = new Set()
  for (const key of Object.keys(notesLinkSearch)) delete notesLinkSearch[key]
  for (const key of Object.keys(linkOptions)) delete linkOptions[key]
  for (const key of Object.keys(linkLoading)) delete linkLoading[key]
}

function buildEmptyFormData(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const f of writableFields.value) {
    if (f.field_type === 'checkbox') defaults[f.column_name] = 0
    else defaults[f.column_name] = undefined
  }
  return defaults
}

function syncFormData(rec: RecordRow | null | undefined) {
  resetPickerState()
  if (!rec) {
    formData.value = buildEmptyFormData()
    return
  }

  formData.value = { ...rec }
  for (const f of writableFields.value) {
    const val = rec[f.column_name]
    if (!val || f.field_type !== 'link') continue
    const id = extractLinkId(val)
    if (!id) continue
    try {
      const parsed = JSON.parse(String(val))
      if (parsed?.title) {
        linkOptions[f.column_name] = [{ label: parsed.title, value: id }]
      }
    } catch {
      linkOptions[f.column_name] = [{ label: `#${id}`, value: id }]
    }
  }
}

watch(
  [() => visible.value, () => props.record, writableFields],
  ([isVisible, rec]) => {
    if (!isVisible) return
    syncFormData(rec)
  },
  { immediate: true }
)

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const payload: Record<string, unknown> = {}
    for (const field of writableFields.value) {
      const val = formData.value[field.column_name]
      payload[field.column_name] = val === '' ? null : val
    }
    emit('submit', payload)
    visible.value = false
  } finally {
    submitting.value = false
  }
}

// ── Link field picker ──────────────────────────────────────
const linkOptions = reactive<Record<string, SelectOption[]>>({})
const linkLoading = reactive<Record<string, boolean>>({})
let linkSearchTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function getLinkConfig(field: FieldMeta): { table: string; displayField?: string } | null {
  if (field.field_type !== 'link' || !field.select_options) return null
  const config = field.select_options as unknown as { link_table?: string; link_display_field?: string }
  if (!config.link_table) return null
  return { table: config.link_table, displayField: config.link_display_field }
}

function extractLinkId(val: unknown): string | null {
  if (!val) return null
  try {
    const parsed = JSON.parse(String(val))
    if (parsed && typeof parsed === 'object' && parsed.id) return String(parsed.id)
  } catch {}
  return String(val)
}

function searchLinkRecords(field: FieldMeta, query: string) {
  const cfg = getLinkConfig(field)
  if (!cfg) return
  const col = field.column_name
  if (linkSearchTimers[col]) clearTimeout(linkSearchTimers[col])
  linkSearchTimers[col] = setTimeout(async () => {
    linkLoading[col] = true
    try {
      const results = await api.searchRecords(cfg.table, query || undefined, 50, cfg.displayField)
      linkOptions[col] = results.map(r => ({ label: r.title, value: r.id }))
    } catch {}
    linkLoading[col] = false
  }, query ? 300 : 0)
}

// ── Notes link tree picker ────────────────────────────────
const { treeData: allNotes, buildTreeList, searchNotes } = useNoteTree()
const notesLinkExpanded = ref(new Set<string>())
const notesLinkSearch = reactive<Record<string, string>>({})

const notesTreeList = buildTreeList(notesLinkExpanded)

function isNotesLink(field: FieldMeta): boolean {
  const cfg = getLinkConfig(field)
  return cfg?.table === '_notes'
}

function toggleNotesLinkExpand(id: string) {
  const s = new Set(notesLinkExpanded.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  notesLinkExpanded.value = s
}

function getFilteredNotes(colName: string): NoteTreeNode[] {
  const q = (notesLinkSearch[colName] || '').toLowerCase().trim()
  if (!q) return notesTreeList.value
  return (allNotes.value ?? [])
    .filter(n => n.title.toLowerCase().includes(q))
    .map(n => ({ note: n, depth: 0, hasChildren: false }))
}

function getSelectedNoteTitle(colName: string): string {
  const id = extractLinkId(formData.value[colName])
  if (!id) return ''
  const note = (allNotes.value ?? []).find(n => n.id === id)
  return note ? `${note.title || 'Untitled'}` : `#${id}`
}

// ── 日期工具（兼容数字、数字字符串、日期字符串）──────────────
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
</script>

<style scoped>
.notes-link-picker {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nlp-input-wrap {
  height: 34px;
  display: flex;
  align-items: center;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  padding: 0 8px;
  background: #fff;
  box-sizing: border-box;
}
.nlp-input-wrap:focus-within { border-color: #b3b0ab; }
.nlp-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #f0f0ef;
  border-radius: 4px;
  font-size: 13px;
  color: #37352f;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nlp-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #9b9a97;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}
.nlp-clear:hover { color: #e03e3e; }
.nlp-search-inline {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #37352f;
  background: transparent;
  height: 100%;
}
.nlp-search-inline::placeholder { color: #c4c4c0; }
.nlp-tree {
  height: 200px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  background: #fff;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}
.nlp-empty {
  min-height: 100%;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9b9a97;
  font-size: 13px;
  box-sizing: border-box;
}
.nlp-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 13px;
  color: #37352f;
  transition: background 0.1s;
}
.nlp-item:hover { background: #f7f7f5; }
.nlp-item.selected { background: #e8f0fe; }
.nlp-arrow {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  font-size: 14px;
  color: #9b9a97;
  cursor: pointer;
  transition: transform 0.15s;
  flex-shrink: 0;
}
.nlp-arrow.expanded { transform: rotate(90deg); }
.nlp-arrow-ph { width: 16px; flex-shrink: 0; }
.nlp-icon { font-size: 14px; flex-shrink: 0; }
.nlp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
