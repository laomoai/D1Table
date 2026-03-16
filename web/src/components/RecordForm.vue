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
          placeholder="https://"
          type="text"
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
import { ref, computed, watch } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NInputNumber, NButton,
  NSwitch, NSelect, NDatePicker,
  type FormInst,
} from 'naive-ui'
import type { FieldMeta, RecordRow } from '@/api/client'

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

// 编辑模式：填入现有值
watch(
  () => props.record,
  (rec) => {
    if (rec) {
      formData.value = { ...rec }
    } else {
      // 新增模式：设置默认值
      const defaults: Record<string, unknown> = {}
      for (const f of writableFields.value) {
        if (f.field_type === 'checkbox') defaults[f.column_name] = 0
        else defaults[f.column_name] = undefined
      }
      formData.value = defaults
    }
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
  return new Date(ts).toISOString().slice(0, 10)
}

function datetimeToTs(v: unknown): number | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) return (n < 1e10 ? n * 1000 : n)
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d.getTime()
}
</script>
