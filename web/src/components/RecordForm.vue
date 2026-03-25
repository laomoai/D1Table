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

        <!-- link (record picker) -->
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
  NSwitch, NSelect, NDatePicker, NTooltip,
  type FormInst, type SelectOption,
} from 'naive-ui'
import type { FieldMeta, RecordRow } from '@/api/client'
import { api } from '@/api/client'
import ImageUpload from './ImageUpload.vue'
import PasswordInput from './PasswordInput.vue'

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
      // 预填 link/note 字段的选项，确保当前值能显示
      for (const f of writableFields.value) {
        const val = rec[f.column_name]
        if (!val) continue
        if (f.field_type === 'link') {
          const id = extractLinkId(val)
          if (id) {
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
      }
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
