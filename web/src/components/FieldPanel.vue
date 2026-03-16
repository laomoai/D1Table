<template>
  <n-drawer v-model:show="visible" :width="340" placement="right">
    <n-drawer-content title="Field Management" :native-scrollbar="false">
      <div class="field-list">
        <div v-for="(field, idx) in localFields" :key="field.column_name">
          <!-- 字段行 -->
          <div
            class="field-item"
            :class="{ active: expandedCol === field.column_name, hidden: field.is_hidden }"
            @click="toggleExpand(field)"
          >
            <span class="field-icon" :style="{ color: typeColor(field.field_type) }">
              {{ typeIcon(field.field_type) }}
            </span>
            <div class="field-title-area">
              <span class="field-name">{{ field.title }}</span>
              <span class="field-col-hint">{{ field.column_name }}</span>
            </div>
            <div class="field-actions" @click.stop>
              <button class="icon-btn" :disabled="idx === 0" @click="moveField(idx, -1)" title="Move up">↑</button>
              <button class="icon-btn" :disabled="idx === localFields.length - 1" @click="moveField(idx, 1)" title="Move down">↓</button>
              <button
                class="icon-btn"
                :class="{ 'eye-hidden': field.is_hidden }"
                @click="toggleHidden(field)"
                :title="field.is_hidden ? 'Show field' : 'Hide field'"
              >{{ field.is_hidden ? '👁️' : '👁' }}</button>
            </div>
          </div>

          <!-- 字段编辑器（展开） -->
          <n-collapse-transition :show="expandedCol === field.column_name">
            <div class="field-editor">
              <div class="editor-section">
                <div class="editor-label">Field Name</div>
                <n-input
                  v-model:value="editForm.title"
                  size="small"
                  placeholder="Field display name"
                  @keyup.enter="saveFieldEdit(field)"
                />
              </div>

              <div class="editor-section">
                <div class="editor-label">Field Type</div>
                <div class="type-grid">
                  <button
                    v-for="t in fieldTypes"
                    :key="t.value"
                    class="type-btn"
                    :class="{ active: editForm.field_type === t.value }"
                    :style="editForm.field_type === t.value ? { borderColor: t.color, background: t.color + '18', color: t.color } : {}"
                    @click="selectType(t.value as FieldType)"
                    :title="t.label"
                  >
                    <span class="type-btn-icon">{{ t.icon }}</span>
                    <span class="type-btn-label">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Select 选项编辑器 -->
              <div v-if="editForm.field_type === 'select'" class="editor-section">
                <div class="editor-label">Options</div>
                <div class="select-options-editor">
                  <div
                    v-for="(opt, oi) in editForm.select_options"
                    :key="oi"
                    class="select-opt-row"
                  >
                    <input
                      v-model="opt.label"
                      class="opt-label-input"
                      placeholder="Option name"
                      @input="opt.value = opt.label"
                    />
                    <input
                      v-model="opt.color"
                      type="color"
                      class="opt-color-input"
                      title="Choose color"
                    />
                    <button class="icon-btn" @click="editForm.select_options.splice(oi, 1)">✕</button>
                  </div>
                  <button class="add-opt-btn" @click="addSelectOption(editForm.select_options)">+ Add Option</button>
                </div>
              </div>

              <div class="editor-footer">
                <n-button size="small" @click="cancelExpand">Cancel</n-button>
                <n-button size="small" type="primary" :loading="saving" @click="saveFieldEdit(field)">Save</n-button>
              </div>
            </div>
          </n-collapse-transition>
        </div>
      </div>

      <!-- 添加字段区域 -->
      <div class="add-field-section">
        <n-collapse-transition :show="showAddForm">
          <div class="add-field-form">
            <div class="editor-section">
              <div class="editor-label">Field Name</div>
              <n-input v-model:value="newField.title" size="small" placeholder="Field display name" />
            </div>
            <div class="editor-section">
              <div class="editor-label">Field Type</div>
              <div class="type-grid">
                <button
                  v-for="t in fieldTypes"
                  :key="t.value"
                  class="type-btn"
                  :class="{ active: newField.field_type === t.value }"
                  :style="newField.field_type === t.value ? { borderColor: t.color, background: t.color + '18', color: t.color } : {}"
                  @click="newField.field_type = t.value as FieldType"
                  :title="t.label"
                >
                  <span class="type-btn-icon">{{ t.icon }}</span>
                  <span class="type-btn-label">{{ t.label }}</span>
                </button>
              </div>
            </div>
            <template v-if="newField.field_type === 'select'">
              <div class="editor-section">
                <div class="editor-label">Options</div>
                <div class="select-options-editor">
                  <div v-for="(opt, oi) in newField.select_options" :key="oi" class="select-opt-row">
                    <input v-model="opt.label" class="opt-label-input" placeholder="Option name" @input="opt.value = opt.label" />
                    <input v-model="opt.color" type="color" class="opt-color-input" />
                    <button class="icon-btn" @click="newField.select_options.splice(oi, 1)">✕</button>
                  </div>
                  <button class="add-opt-btn" @click="addSelectOption(newField.select_options)">+ Add Option</button>
                </div>
              </div>
            </template>
            <div class="editor-footer">
              <n-button size="small" @click="showAddForm = false">Cancel</n-button>
              <n-button size="small" type="primary" :loading="adding" @click="submitAddField">Add</n-button>
            </div>
          </div>
        </n-collapse-transition>

        <n-button
          v-if="!showAddForm"
          dashed
          size="small"
          style="width:100%; margin-top:12px;"
          @click="openAddForm"
        >
          + Add Field
        </n-button>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useMessage, NDrawer, NDrawerContent, NInput, NButton, NCollapseTransition } from 'naive-ui'
import { api, type FieldMeta, type FieldType, type SelectOption } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'

const props = defineProps<{
  tableName: string
  fields: FieldMeta[]
}>()

const emit = defineEmits<{ refresh: [] }>()
const visible = defineModel<boolean>('show', { default: false })

const message = useMessage()
const queryClient = useQueryClient()

const localFields = ref<FieldMeta[]>([])
watch(() => props.fields, (f) => {
  localFields.value = [...f]
}, { immediate: true })

// ── 字段类型定义 ────────────────────────────────────────────────
const fieldTypes = [
  { value: 'text',     label: 'Text',      icon: 'T',  color: '#666' },
  { value: 'longtext', label: 'Long text', icon: '¶',  color: '#888' },
  { value: 'number',   label: 'Number',    icon: '#',  color: '#4f6ef7' },
  { value: 'currency', label: 'Currency',  icon: '¥',  color: '#18a058' },
  { value: 'percent',  label: 'Percent',   icon: '%',  color: '#f0a020' },
  { value: 'email',    label: 'Email',     icon: '@',  color: '#00adb5' },
  { value: 'url',      label: 'URL',       icon: '🔗', color: '#4f6ef7' },
  { value: 'date',     label: 'Date',      icon: '📅', color: '#8a2be2' },
  { value: 'datetime', label: 'Datetime',  icon: '🕐', color: '#d03050' },
  { value: 'checkbox', label: 'Checkbox',  icon: '☑',  color: '#18a058' },
  { value: 'select',   label: 'Select',    icon: '◉',  color: '#f0a020' },
]

// ── 展开编辑 ──────────────────────────────────────────────────
const expandedCol = ref<string | null>(null)
const saving = ref(false)
const editForm = ref({
  title: '',
  field_type: 'text' as FieldType,
  select_options: [] as SelectOption[],
})

function toggleExpand(field: FieldMeta) {
  if (expandedCol.value === field.column_name) {
    cancelExpand()
    return
  }
  expandedCol.value = field.column_name
  editForm.value = {
    title: field.title,
    field_type: field.field_type,
    select_options: field.select_options ? field.select_options.map(o => ({ ...o })) : [],
  }
  // 关闭新增表单
  showAddForm.value = false
}

function cancelExpand() {
  expandedCol.value = null
}

function selectType(type: FieldType) {
  editForm.value.field_type = type
  if (type === 'select' && editForm.value.select_options.length === 0) {
    addSelectOption(editForm.value.select_options)
  }
}

const SELECT_COLORS = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']

function addSelectOption(options: SelectOption[]) {
  options.push({ value: '', label: '', color: SELECT_COLORS[options.length % SELECT_COLORS.length] })
}

async function saveFieldEdit(field: FieldMeta) {
  if (!editForm.value.title.trim()) {
    message.warning('Field name cannot be empty')
    return
  }
  saving.value = true
  try {
    const patch: Parameters<typeof api.updateFieldMeta>[2] = {}
    if (editForm.value.title.trim() !== field.title) {
      patch.title = editForm.value.title.trim()
    }
    if (editForm.value.field_type !== field.field_type) {
      patch.field_type = editForm.value.field_type
    }
    if (editForm.value.field_type === 'select') {
      patch.select_options = editForm.value.select_options.filter(o => o.label.trim())
    } else if (field.field_type === 'select') {
      patch.select_options = []
    }

    if (Object.keys(patch).length === 0) {
      cancelExpand()
      return
    }

    await api.updateFieldMeta(props.tableName, field.column_name, patch)
    message.success('Field updated')
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
    cancelExpand()
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

// ── 可见性切换 ────────────────────────────────────────────────
async function toggleHidden(field: FieldMeta) {
  try {
    await api.updateFieldMeta(props.tableName, field.column_name, { is_hidden: !field.is_hidden })
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
  }
}

// ── 排序 ──────────────────────────────────────────────────────
async function moveField(idx: number, dir: -1 | 1) {
  const target = idx + dir
  if (target < 0 || target >= localFields.value.length) return

  const arr = [...localFields.value]
  const [moved] = arr.splice(idx, 1)
  arr.splice(target, 0, moved)
  localFields.value = arr

  try {
    // Only the two swapped positions changed; all others retain their order_index
    await Promise.all([
      api.updateFieldMeta(props.tableName, arr[idx].column_name, { order_index: idx * 10 }),
      api.updateFieldMeta(props.tableName, arr[target].column_name, { order_index: target * 10 }),
    ])
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
  }
}

// ── 添加字段 ──────────────────────────────────────────────────
const showAddForm = ref(false)
const adding = ref(false)
const newField = ref({
  title: '',
  field_type: 'text' as FieldType,
  select_options: [] as SelectOption[],
})

function openAddForm() {
  newField.value = { title: '', field_type: 'text', select_options: [] }
  showAddForm.value = true
  cancelExpand()
}


async function submitAddField() {
  if (!newField.value.title.trim()) {
    message.warning('Please enter a field display name')
    return
  }
  adding.value = true
  try {
    await api.addField(props.tableName, {
      title: newField.value.title.trim(),
      field_type: newField.value.field_type,
      select_options: newField.value.field_type === 'select' ? newField.value.select_options : undefined,
    })
    message.success('Field added')
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
    showAddForm.value = false
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    adding.value = false
  }
}

// ── 暴露方法供父组件调用 ──────────────────────────────────────
function expand(colName: string) {
  const field = localFields.value.find(f => f.column_name === colName)
  if (!field) return
  visible.value = true
  nextTick(() => toggleExpand(field))
}

defineExpose({ expand })

// ── 类型图标 & 颜色 ────────────────────────────────────────────
function typeIcon(type: FieldType): string {
  return fieldTypes.find(t => t.value === type)?.icon ?? 'T'
}

function typeColor(type: FieldType): string {
  return fieldTypes.find(t => t.value === type)?.color ?? '#666'
}
</script>

<style scoped>
.field-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.field-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  background: #f8f9fc;
  border: 1px solid #eef0f5;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.field-item:hover { background: #f0f2ff; }
.field-item.active {
  background: #eef1ff;
  border-color: #c5ccf5;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.field-item.hidden { opacity: 0.5; }
.field-icon {
  font-size: 13px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
}
.field-title-area {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.field-name {
  font-size: 13px;
  color: #333;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-col-hint {
  font-size: 11px;
  color: #aaa;
  white-space: nowrap;
}
.field-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 13px;
  color: #888;
  transition: background 0.1s;
}
.icon-btn:hover:not(:disabled) { background: #e8eaf0; color: #333; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.eye-hidden { opacity: 0.4; }

/* ── 字段编辑器 ─────────────────────── */
.field-editor {
  background: #f4f5fb;
  border: 1px solid #c5ccf5;
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 12px;
  margin-bottom: 2px;
}
.editor-section {
  margin-bottom: 12px;
}
.editor-label {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border: 1px solid #e0e2ea;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #555;
  transition: all 0.15s;
  font-size: 11px;
}
.type-btn:hover {
  border-color: #4f6ef7;
  color: #4f6ef7;
  background: #f0f2ff;
}
.type-btn.active {
  font-weight: 600;
}
.type-btn-icon {
  font-size: 14px;
  line-height: 1;
}
.type-btn-label {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.editor-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* ── Select 选项编辑器 ─────────────────── */
.select-options-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.select-opt-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.opt-label-input {
  flex: 1;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.opt-label-input:focus { border-color: #4f6ef7; }
.opt-color-input {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}
.add-opt-btn {
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 12px;
  color: #888;
  cursor: pointer;
  margin-top: 2px;
}
.add-opt-btn:hover { border-color: #4f6ef7; color: #4f6ef7; }

/* ── 添加字段区域 ─────────────────────── */
.add-field-section { margin-top: 16px; }
.add-field-form {
  background: #f8f9fc;
  border: 1px solid #e8eaf0;
  border-radius: 8px;
  padding: 12px;
}
</style>
