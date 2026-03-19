<template>
  <AppModal v-model:show="visible" title="New Table" @after-enter="focusName">
    <!-- Table Name -->
    <div class="section">
      <label class="label">Table name</label>
      <input
        ref="nameInputRef"
        v-model="form.displayName"
        class="name-input"
        placeholder="e.g. Customers, Orders, Products..."
        @keyup.enter="handleSubmit"
      />
    </div>

    <!-- Fields -->
    <div class="section">
      <div class="section-head">
        <span class="label">Fields</span>
        <span class="hint">id · created_at are added automatically</span>
      </div>

      <div class="field-list" @click="closeTypePicker">
        <div v-for="(col, idx) in form.columns" :key="idx" class="field-block">
          <div class="field-row">
            <input
              v-model="col.displayName"
              class="col-name-input"
              placeholder="Field name"
            />
            <!-- Type picker button -->
            <button
              class="type-btn"
              :class="{ open: openTypePicker === idx }"
              @click.stop="toggleTypePicker(idx)"
            >
              <span
                class="type-icon"
                :style="`color: ${TYPE_META[col.fieldType]?.color}`"
              >{{ TYPE_META[col.fieldType]?.icon }}</span>
              <span class="type-label">{{ TYPE_META[col.fieldType]?.label }}</span>
              <span class="type-arrow">▾</span>
            </button>
            <button
              class="remove-btn"
              :disabled="form.columns.length <= 1"
              @click="removeColumn(idx)"
              title="Remove field"
            >×</button>
          </div>

          <!-- Inline type picker panel -->
          <div v-if="openTypePicker === idx" class="type-picker-panel" @click.stop>
            <button
              v-for="(meta, typeKey) in TYPE_META"
              :key="typeKey"
              class="type-option"
              :class="{ active: col.fieldType === typeKey }"
              @click="selectType(col, typeKey as FieldType)"
            >
              <span class="type-option-icon" :style="`color: ${meta.color}`">{{ meta.icon }}</span>
              <span class="type-option-label">{{ meta.label }}</span>
            </button>
          </div>

          <!-- Select options inline -->
          <div v-if="col.fieldType === 'select'" class="select-opts-block">
            <div class="select-opts-title">Options for "{{ col.displayName || 'this field' }}"</div>
            <div v-for="(opt, oi) in col.selectOptions" :key="oi" class="select-opt-row">
              <input
                v-model="opt.label"
                class="opt-input"
                placeholder="Option name"
                @input="opt.value = opt.label"
              />
              <input v-model="opt.color" type="color" class="color-dot" />
              <button class="remove-btn" @click="col.selectOptions.splice(oi, 1)">×</button>
            </div>
            <button class="add-link-btn" @click="addSelectOption(col)">+ Add option</button>
          </div>
        </div>
      </div>

      <button class="add-link-btn" @click="addColumn">+ Add field</button>
    </div>

    <template #footer>
      <button class="btn-cancel" @click="visible = false">Cancel</button>
      <button class="btn-create" :disabled="submitting || !form.displayName.trim()" @click="handleSubmit">
        {{ submitting ? 'Creating…' : 'Create table' }}
      </button>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { http } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'
import type { FieldType, SelectOption } from '@/api/client'
import AppModal from './AppModal.vue'

const visible = defineModel<boolean>('show', { default: false })
const emit = defineEmits<{ created: [name: string] }>()

const message = useMessage()
const queryClient = useQueryClient()
const nameInputRef = ref<HTMLInputElement>()
const submitting = ref(false)
const openTypePicker = ref<number | null>(null)

interface ColDef {
  displayName: string
  fieldType: FieldType
  type: string
  selectOptions: SelectOption[]
}

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  text:     { label: 'Text',      icon: 'T',  color: '#787774' },
  longtext: { label: 'Long text', icon: '¶',  color: '#a3a19d' },
  number:   { label: 'Number',    icon: '#',  color: '#4f6ef7' },
  currency: { label: 'Currency',  icon: '¥',  color: '#18a058' },
  percent:  { label: 'Percent',   icon: '%',  color: '#f0a020' },
  email:    { label: 'Email',     icon: '@',  color: '#00adb5' },
  url:      { label: 'URL',       icon: '🔗', color: '#4f6ef7' },
  date:     { label: 'Date',      icon: '📅', color: '#8a2be2' },
  datetime: { label: 'Datetime',  icon: '🕐', color: '#d03050' },
  checkbox: { label: 'Checkbox',  icon: '☑',  color: '#18a058' },
  select:   { label: 'Select',    icon: '◉',  color: '#f0a020' },
  image:    { label: 'Image',     icon: '🖼', color: '#e91e8c' },
}

const fieldTypeToSqlite: Record<string, string> = {
  text: 'TEXT', longtext: 'TEXT', email: 'TEXT', url: 'TEXT', select: 'TEXT', image: 'TEXT',
  number: 'REAL', currency: 'REAL', percent: 'REAL',
  date: 'TEXT', datetime: 'INTEGER',
  checkbox: 'INTEGER',
}

function generateTableName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `tbl_${id}`
}

function generateColName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `col_${id}`
}

function syncSqliteType(col: ColDef) {
  col.type = fieldTypeToSqlite[col.fieldType] ?? 'TEXT'
}

function toggleTypePicker(idx: number) {
  openTypePicker.value = openTypePicker.value === idx ? null : idx
}

function closeTypePicker() {
  openTypePicker.value = null
}

function selectType(col: ColDef, typeKey: FieldType) {
  col.fieldType = typeKey
  syncSqliteType(col)
  openTypePicker.value = null
}

interface FormData {
  displayName: string
  columns: ColDef[]
}

function defaultForm(): FormData {
  return {
    displayName: '',
    columns: [
      { displayName: 'Name', fieldType: 'text' as FieldType, type: 'TEXT', selectOptions: [] },
    ],
  }
}

const form = ref<FormData>(defaultForm())

function focusName() {
  nextTick(() => nameInputRef.value?.focus())
}

function addColumn() {
  form.value.columns.push({ displayName: '', fieldType: 'text', type: 'TEXT', selectOptions: [] })
}

function removeColumn(idx: number) {
  form.value.columns.splice(idx, 1)
}

function generateOptId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `opt_${id}`
}

function addSelectOption(col: ColDef) {
  const colors = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']
  col.selectOptions.push({ id: generateOptId(), value: '', label: '', color: colors[col.selectOptions.length % colors.length] })
}

async function handleSubmit() {
  if (!form.value.displayName.trim()) {
    nameInputRef.value?.focus()
    return
  }

  const cols = form.value.columns.filter(c => c.displayName.trim())
  if (cols.length === 0) {
    message.warning('Please add at least one field')
    return
  }

  const tableName = generateTableName()
  submitting.value = true
  try {
    await http.post('/tables', {
      name: tableName,
      title: form.value.displayName.trim(),
      columns: cols.map(c => ({
        name: generateColName(),
        title: c.displayName.trim(),
        type: c.type,
        field_type: c.fieldType,
        nullable: true,
        select_options: c.fieldType === 'select' ? c.selectOptions : undefined,
      })),
    })
    message.success(`"${form.value.displayName}" created`)
    await queryClient.invalidateQueries({ queryKey: ['tables'] })
    await queryClient.refetchQueries({ queryKey: ['tables'] })
    emit('created', tableName)
    visible.value = false
    form.value = defaultForm()
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.section { display: flex; flex-direction: column; gap: 8px; }

.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.label {
  font-size: 13px;
  font-weight: 600;
  color: #37352f;
}
.hint {
  font-size: 12px;
  color: #a3a19d;
}

.name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 15px;
  color: #37352f;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  outline: none;
  transition: border-color 0.12s;
  font-family: inherit;
  background: #fff;
}
.name-input:focus { border-color: #b3b0ab; }
.name-input::placeholder { color: #a3a19d; }

.field-list { display: flex; flex-direction: column; gap: 4px; }
.field-block { display: flex; flex-direction: column; gap: 0; }

.field-row {
  display: grid;
  grid-template-columns: 1fr auto 28px;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.col-name-input {
  min-width: 0;
  padding: 6px 8px;
  font-size: 13px;
  color: #37352f;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  outline: none;
  font-family: inherit;
  background: #fff;
  transition: border-color 0.12s;
}
.col-name-input:focus { border-color: #b3b0ab; }
.col-name-input::placeholder { color: #a3a19d; }

.type-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: #37352f;
  white-space: nowrap;
  min-width: 130px;
  transition: border-color 0.12s, background 0.12s;
}
.type-btn:hover, .type-btn.open { border-color: #b3b0ab; background: #f7f7f5; }
.type-icon { font-size: 12px; font-weight: 700; flex-shrink: 0; width: 16px; text-align: center; }
.type-label { flex: 1; }
.type-arrow { font-size: 10px; color: #a3a19d; flex-shrink: 0; }

.type-picker-panel {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.type-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: #37352f;
  text-align: left;
  transition: background 0.1s, border-color 0.1s;
}
.type-option:hover { background: rgba(55,53,47,0.06); }
.type-option.active { background: rgba(55,53,47,0.08); border-color: #b3b0ab; }
.type-option-icon { font-size: 12px; font-weight: 700; flex-shrink: 0; width: 14px; text-align: center; }
.type-option-label { white-space: nowrap; }

.remove-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #a3a19d;
  cursor: pointer;
  padding: 0 3px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s;
}
.remove-btn:hover:not(:disabled) { color: #eb5757; background: #fdf2f2; }
.remove-btn:disabled { opacity: 0.3; cursor: default; }

.select-opts-block {
  background: #f7f7f5;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.select-opts-title { font-size: 12px; color: #787774; font-weight: 500; }
.select-opt-row { display: flex; align-items: center; gap: 8px; }
.opt-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  outline: none;
  color: #37352f;
  font-family: inherit;
}
.opt-input:focus { border-color: #b3b0ab; }
.color-dot {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.add-link-btn {
  background: none;
  border: none;
  font-size: 13px;
  color: #787774;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
  transition: color 0.12s;
}
.add-link-btn:hover { color: #37352f; }

.btn-cancel {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  padding: 6px 16px;
  font-size: 14px;
  color: #787774;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s, color 0.12s;
}
.btn-cancel:hover { border-color: #b3b0ab; color: #37352f; }
.btn-create {
  background: #37352f;
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}
.btn-create:hover:not(:disabled) { background: #2f2d28; }
.btn-create:disabled { opacity: 0.4; cursor: default; }
</style>
