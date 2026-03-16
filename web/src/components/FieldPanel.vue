<template>
  <n-drawer v-model:show="visible" :width="340" placement="right">
    <n-drawer-content title="Field Management" :native-scrollbar="false">
      <div class="field-list">
        <div
          v-for="(field, idx) in localFields"
          :key="field.column_name"
          class="field-item"
          :class="{ hidden: field.is_hidden }"
        >
          <!-- 字段类型图标 -->
          <span class="field-icon" :style="{ color: typeColor(field.field_type) }">
            {{ typeIcon(field.field_type) }}
          </span>

          <!-- 字段标题（可内联编辑） -->
          <div class="field-title-area" @dblclick="startEdit(field)">
            <template v-if="editingCol === field.column_name">
              <n-input
                v-model:value="editTitle"
                size="small"
                style="flex:1"
                @keyup.enter="saveEdit(field)"
                @keyup.escape="cancelEdit"
                @blur="saveEdit(field)"
                ref="editInputRef"
              />
            </template>
            <template v-else>
              <span class="field-name">{{ field.title }}</span>
              <span class="field-col-hint">{{ field.column_name }}</span>
            </template>
          </div>

          <!-- 右侧操作：上移/下移/眼睛 -->
          <div class="field-actions">
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
      </div>

      <!-- 添加字段区域 -->
      <div class="add-field-section">
        <n-collapse-transition :show="showAddForm">
          <div class="add-field-form">
            <n-form size="small" label-placement="left" label-width="60">
              <n-form-item label="Display Name">
                <n-input v-model:value="newField.title" placeholder="Field display name" />
              </n-form-item>
              <n-form-item label="Type">
                <n-select
                  v-model:value="newField.field_type"
                  :options="fieldTypeOptions"
                />
              </n-form-item>
              <!-- select type options -->
              <template v-if="newField.field_type === 'select'">
                <n-form-item label="Options">
                  <div class="select-options-editor">
                    <div
                      v-for="(opt, oi) in newField.select_options"
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
                      <button class="icon-btn" @click="newField.select_options.splice(oi, 1)">✕</button>
                    </div>
                    <button class="add-opt-btn" @click="addSelectOption">+ Add Option</button>
                  </div>
                </n-form-item>
              </template>
              <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
                <n-button size="small" @click="showAddForm = false">Cancel</n-button>
                <n-button size="small" type="primary" :loading="adding" @click="submitAddField">Add</n-button>
              </div>
            </n-form>
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
import { useMessage, NDrawer, NDrawerContent, NInput, NButton, NSelect, NForm, NFormItem, NCollapseTransition } from 'naive-ui'
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

// 本地副本，用于拖拽排序
const localFields = ref<FieldMeta[]>([])
watch(() => props.fields, (f) => {
  localFields.value = [...f]
}, { immediate: true })

// ── 内联编辑 ──────────────────────────────────────────────────
const editingCol = ref<string | null>(null)
const editTitle = ref('')
const editInputRef = ref<InstanceType<typeof NInput>>()

function startEdit(field: FieldMeta) {
  editingCol.value = field.column_name
  editTitle.value = field.title
  nextTick(() => {
    editInputRef.value?.focus()
  })
}

function cancelEdit() {
  editingCol.value = null
  editTitle.value = ''
}

async function saveEdit(field: FieldMeta) {
  if (!editTitle.value.trim() || editTitle.value === field.title) {
    cancelEdit()
    return
  }
  try {
    await api.updateFieldMeta(props.tableName, field.column_name, { title: editTitle.value.trim() })
    message.success('Field name updated')
    queryClient.invalidateQueries({ queryKey: ['fields', props.tableName] })
    emit('refresh')
  } catch (err) {
    message.error((err as Error).message)
  }
  cancelEdit()
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

  // 批量更新 order_index
  try {
    await Promise.all(
      arr.map((f, i) => api.updateFieldMeta(props.tableName, f.column_name, { order_index: i * 10 }))
    )
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

function openAddForm() {
  newField.value = { title: '', field_type: 'text', select_options: [] }
  showAddForm.value = true
}

function addSelectOption() {
  const colors = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']
  const color = colors[newField.value.select_options.length % colors.length]
  newField.value.select_options.push({ value: '', label: '', color })
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
.field-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f8f9fc;
  border: 1px solid #eef0f5;
  transition: background 0.15s;
}
.field-item:hover { background: #f0f2ff; }
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
  cursor: pointer;
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
.add-field-section { margin-top: 16px; }
.add-field-form {
  background: #f8f9fc;
  border: 1px solid #e8eaf0;
  border-radius: 8px;
  padding: 12px;
}
.select-options-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
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
  margin-top: 4px;
}
.add-opt-btn:hover { border-color: #4f6ef7; color: #4f6ef7; }
</style>
