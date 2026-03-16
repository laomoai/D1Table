<template>
  <n-modal
    v-model:show="visible"
    title="新建表"
    preset="card"
    style="width: 600px;"
    :mask-closable="false"
  >
    <n-form ref="formRef" :model="form" label-placement="left" label-width="80">
      <n-form-item
        label="表名"
        path="displayName"
        :rule="{ required: true, message: '请输入表名', trigger: ['blur', 'input'] }"
      >
        <n-input
          v-model:value="form.displayName"
          placeholder="如：客户列表、订单管理"
        />
      </n-form-item>
    </n-form>

    <!-- 字段列表 -->
    <div class="section-title">
      字段定义
      <span class="section-hint">（id 和 created_at 自动添加）</span>
    </div>

    <div class="col-header-row">
      <span style="width:160px">显示名</span>
      <span style="width:140px">类型</span>
      <span style="width:50px">可空</span>
      <span style="width:28px"></span>
    </div>

    <div v-for="(col, idx) in form.columns" :key="idx" class="col-row">
      <n-input
        v-model:value="col.displayName"
        placeholder="字段显示名"
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
      + 添加字段
    </n-button>

    <!-- select 类型选项编辑 -->
    <template v-for="(col, idx) in form.columns" :key="`opt-${idx}`">
      <div v-if="col.fieldType === 'select'" class="select-options-section">
        <div class="section-title" style="margin-top: 12px; margin-bottom: 8px;">
          字段「{{ col.displayName || '未命名' }}」的选项
        </div>
        <div v-for="(opt, oi) in col.selectOptions" :key="oi" class="select-opt-row">
          <n-input
            v-model:value="opt.label"
            size="small"
            placeholder="选项名"
            style="width: 140px;"
            @input="opt.value = opt.label"
          />
          <input v-model="opt.color" type="color" class="color-picker" title="选择颜色" />
          <n-button size="small" quaternary @click="col.selectOptions.splice(oi, 1)">✕</n-button>
        </div>
        <n-button size="small" dashed style="margin-top: 4px;" @click="addSelectOption(col)">
          + 添加选项
        </n-button>
      </div>
    </template>

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="visible = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="handleSubmit">创建</n-button>
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
  { label: 'T  文本', value: 'text' },
  { label: '¶  长文本', value: 'longtext' },
  { label: '#  数字', value: 'number' },
  { label: '¥  货币', value: 'currency' },
  { label: '%  百分比', value: 'percent' },
  { label: '@  邮箱', value: 'email' },
  { label: '🔗 网址', value: 'url' },
  { label: '📅 日期', value: 'date' },
  { label: '🕐 日期时间', value: 'datetime' },
  { label: '☑  复选框', value: 'checkbox' },
  { label: '◉  下拉选择', value: 'select' },
]

const fieldTypeToSqlite: Record<string, string> = {
  text: 'TEXT', longtext: 'TEXT', email: 'TEXT', url: 'TEXT', select: 'TEXT',
  number: 'REAL', currency: 'REAL', percent: 'REAL',
  date: 'TEXT', datetime: 'INTEGER',
  checkbox: 'INTEGER',
}

// 自动生成 API 表名：tbl_ + 8位随机字符
function generateTableName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `tbl_${id}`
}

// 自动生成列名：col_ + 4位随机字符
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
    { displayName: '名称', fieldType: 'text' as FieldType, type: 'TEXT', nullable: false, selectOptions: [] as SelectOption[] },
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
    message.warning('至少添加一个字段')
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
    message.success(`表「${form.value.displayName}」创建成功`)
    await queryClient.invalidateQueries({ queryKey: ['tables'] })
    await queryClient.refetchQueries({ queryKey: ['tables'] })
    emit('created', tableName)
    visible.value = false
    // 重置
    form.value = {
      displayName: '',
      columns: [{ displayName: '名称', fieldType: 'text', type: 'TEXT', nullable: false, selectOptions: [] }],
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
