<template>
  <n-modal
    v-model:show="visible"
    title="New Table"
    preset="card"
    style="width: 600px;"
    :mask-closable="false"
  >
    <n-form ref="formRef" :model="form" label-placement="left" label-width="80">
      <n-form-item
        label="Table Name"
        path="displayName"
        :rule="{ required: true, message: 'Please enter a table name', trigger: ['blur', 'input'] }"
      >
        <n-input
          v-model:value="form.displayName"
          placeholder="e.g. Customer List, Order Management"
        />
      </n-form-item>
    </n-form>

    <!-- Field list -->
    <div class="section-title">
      Field Definitions
      <span class="section-hint">(id and created_at are added automatically)</span>
    </div>

    <div class="col-header-row">
      <span style="width:160px">Display Name</span>
      <span style="width:140px">Type</span>
      <span style="width:50px">Nullable</span>
      <span style="width:28px"></span>
    </div>

    <div v-for="(col, idx) in form.columns" :key="idx" class="col-row">
      <n-input
        v-model:value="col.displayName"
        placeholder="Field display name"
        style="width: 160px;"
        size="small"
      />
      <n-select
        v-model:value="col.fieldType"
        :options="fieldTypeOptions"
        style="width: 140px;"
        size="small"
        @update:value="() => syncSqliteType(col)"
      />
      <n-checkbox v-model:checked="col.nullable" size="small" />
      <n-button
        size="small"
        quaternary
        @click="removeColumn(idx)"
        :disabled="form.columns.length <= 1"
        style="width:28px;padding:0"
      >✕</n-button>
    </div>

    <n-button dashed size="small" style="margin-top: 8px;" @click="addColumn">
      + Add Field
    </n-button>

    <!-- select type option editor -->
    <template v-for="(col, idx) in form.columns" :key="`opt-${idx}`">
      <div v-if="col.fieldType === 'select'" class="select-options-section">
        <div class="section-title" style="margin-top: 12px; margin-bottom: 8px;">
          Options for field "{{ col.displayName || 'Unnamed' }}"
        </div>
        <div v-for="(opt, oi) in col.selectOptions" :key="oi" class="select-opt-row">
          <n-input
            v-model:value="opt.label"
            size="small"
            placeholder="Option name"
            style="width: 140px;"
            @input="opt.value = opt.label"
          />
          <input v-model="opt.color" type="color" class="color-picker" title="Choose color" />
          <n-button size="small" quaternary @click="col.selectOptions.splice(oi, 1)">✕</n-button>
        </div>
        <n-button size="small" dashed style="margin-top: 4px;" @click="addSelectOption(col)">
          + Add Option
        </n-button>
      </div>
    </template>

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="visible = false">Cancel</n-button>
        <n-button type="primary" :loading="submitting" @click="handleSubmit">Create</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  useMessage, NModal, NForm, NFormItem, NInput, NSelect, NCheckbox,
  NButton, type FormInst,
} from 'naive-ui'
import { http } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'
import type { FieldType, SelectOption } from '@/api/client'

const visible = defineModel<boolean>('show', { default: false })
const emit = defineEmits<{ created: [name: string] }>()

const message = useMessage()
const queryClient = useQueryClient()
const formRef = ref<FormInst>()
const submitting = ref(false)

interface ColDef {
  displayName: string
  fieldType: FieldType
  type: string
  nullable: boolean
  selectOptions: SelectOption[]
}

const fieldTypeOptions = [
  { label: 'T  Text', value: 'text' },
  { label: '¶  Long text', value: 'longtext' },
  { label: '#  Number', value: 'number' },
  { label: '¥  Currency', value: 'currency' },
  { label: '%  Percent', value: 'percent' },
  { label: '@  Email', value: 'email' },
  { label: '🔗 URL', value: 'url' },
  { label: '📅 Date', value: 'date' },
  { label: '🕐 Datetime', value: 'datetime' },
  { label: '☑  Checkbox', value: 'checkbox' },
  { label: '◉  Select', value: 'select' },
]

const fieldTypeToSqlite: Record<string, string> = {
  text: 'TEXT', longtext: 'TEXT', email: 'TEXT', url: 'TEXT', select: 'TEXT',
  number: 'REAL', currency: 'REAL', percent: 'REAL',
  date: 'TEXT', datetime: 'INTEGER',
  checkbox: 'INTEGER',
}

// Auto-generate API table name: tbl_ + 8 random chars
function generateTableName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `tbl_${id}`
}

// Auto-generate column name: col_ + 4 random chars
function generateColName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `col_${id}`
}

function syncSqliteType(col: ColDef) {
  col.type = fieldTypeToSqlite[col.fieldType] ?? 'TEXT'
}

const form = ref({
  displayName: '',
  columns: [
    { displayName: 'Name', fieldType: 'text' as FieldType, type: 'TEXT', nullable: false, selectOptions: [] as SelectOption[] },
  ] as ColDef[],
})

function addColumn() {
  form.value.columns.push({
    displayName: '',
    fieldType: 'text',
    type: 'TEXT',
    nullable: true,
    selectOptions: [],
  })
}

function removeColumn(idx: number) {
  form.value.columns.splice(idx, 1)
}

function addSelectOption(col: ColDef) {
  const colors = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']
  col.selectOptions.push({ value: '', label: '', color: colors[col.selectOptions.length % colors.length] })
}

async function handleSubmit() {
  try { await formRef.value?.validate() } catch { return }

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
        nullable: c.nullable,
        select_options: c.fieldType === 'select' ? c.selectOptions : undefined,
      })),
    })
    message.success(`Table "${form.value.displayName}" created successfully`)
    await queryClient.invalidateQueries({ queryKey: ['tables'] })
    await queryClient.refetchQueries({ queryKey: ['tables'] })
    emit('created', tableName)
    visible.value = false
    // Reset
    form.value = {
      displayName: '',
      columns: [{ displayName: 'Name', fieldType: 'text', type: 'TEXT', nullable: false, selectOptions: [] }],
    }
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.section-title {
  font-weight: 600;
  color: #555;
  margin-bottom: 8px;
  font-size: 13px;
}
.section-hint {
  font-weight: 400;
  color: #aaa;
  font-size: 12px;
  margin-left: 6px;
}
.col-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #999;
  padding-left: 2px;
}
.col-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.select-options-section {
  background: #f8f9fc;
  border: 1px solid #e8eaf0;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.select-opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.color-picker {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}
</style>
