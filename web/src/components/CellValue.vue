<template>
  <!-- 空值 -->
  <span v-if="isEmpty" class="cell-empty">—</span>

  <!-- checkbox -->
  <span v-else-if="fieldType === 'checkbox'" :class="boolVal ? 'cell-check-on' : 'cell-check-off'">
    {{ boolVal ? '✓' : '—' }}
  </span>

  <!-- select -->
  <span
    v-else-if="fieldType === 'select' && selectOpt"
    class="cell-badge"
    :style="{ background: selectOpt.color + '22', color: selectOpt.color, borderColor: selectOpt.color + '55' }"
  >{{ selectOpt.label }}</span>
  <span v-else-if="fieldType === 'select'" class="cell-text">{{ value }}</span>

  <!-- email -->
  <a
    v-else-if="fieldType === 'email' && value"
    :href="`mailto:${value}`"
    :class="detail ? 'cell-link--full' : 'cell-link'"
    @click.stop
  >{{ value }}</a>

  <!-- url -->
  <a
    v-else-if="fieldType === 'url' && value"
    :href="String(value)"
    target="_blank"
    rel="noopener noreferrer"
    :class="detail ? 'cell-link--full' : 'cell-link'"
    @click.stop
  >{{ value }}</a>

  <!-- number -->
  <span v-else-if="fieldType === 'number'" class="cell-number">{{ numVal }}</span>

  <!-- currency -->
  <span v-else-if="fieldType === 'currency'" class="cell-number">{{ currencyVal }}</span>

  <!-- percent -->
  <span v-else-if="fieldType === 'percent'" class="cell-number">{{ percentVal }}</span>

  <!-- date -->
  <span v-else-if="fieldType === 'date'" :class="detail ? 'cell-text--full' : 'cell-text'">{{ dateVal }}</span>

  <!-- datetime -->
  <span v-else-if="fieldType === 'datetime'" :class="detail ? 'cell-text--full' : 'cell-text'">{{ datetimeVal }}</span>

  <!-- longtext -->
  <a
    v-else-if="fieldType === 'longtext' && detail && isUrl(value)"
    :href="String(value)" target="_blank" rel="noopener noreferrer"
    class="cell-link--full"
    @click.stop
  >{{ value }}</a>
  <span v-else-if="fieldType === 'longtext'" :class="detail ? 'cell-longtext--full' : 'cell-longtext'">{{ value }}</span>

  <!-- link (stored as JSON: {"id":"42","title":"Alice"}) -->
  <span
    v-else-if="fieldType === 'link' && linkInfo"
    class="cell-link-record"
    @click.stop="goToLinked"
  >{{ linkInfo.title }}</span>
  <span v-else-if="fieldType === 'link'" class="cell-empty">—</span>

  <!-- note (stored as "id|title|icon") -->
  <span
    v-else-if="fieldType === 'note' && noteInfo"
    class="cell-note"
    @click.stop="goToNote(noteInfo!.id)"
  >{{ noteInfo.icon || '📄' }} {{ noteInfo.title }}</span>
  <span v-else-if="fieldType === 'note'" class="cell-empty">—</span>

  <!-- image -->
  <img
    v-else-if="fieldType === 'image' && imageThumb"
    :src="`/api/files/${imageThumb}`"
    class="cell-image"
    loading="lazy"
  />
  <span v-else-if="fieldType === 'image'" class="cell-empty">—</span>

  <!-- text (default) -->
  <a
    v-else-if="detail && isUrl(value)"
    :href="String(value)" target="_blank" rel="noopener noreferrer"
    class="cell-link--full"
    @click.stop
  >{{ value }}</a>
  <a
    v-else-if="detail && isEmail(value)"
    :href="`mailto:${value}`"
    class="cell-link--full"
    @click.stop
  >{{ value }}</a>
  <span v-else :class="detail ? 'cell-text--full' : 'cell-text'">{{ value }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FieldType, SelectOption, LinkValue } from '@/api/client'
import router from '@/router'
import { decodeNoteValue } from '@/utils/noteValue'

const props = defineProps<{
  value: unknown
  fieldType: FieldType
  selectOptions?: SelectOption[] | null
  detail?: boolean
  linkTable?: string
}>()

const isEmpty = computed(() => {
  const v = props.value
  if (v === null || v === undefined || v === '' || v === '[]' || v === 'null') return true
  if (Array.isArray(v)) return v.length === 0
  return false
})

const linkInfo = computed<LinkValue | null>(() => {
  if (props.fieldType !== 'link' || !props.value) return null
  try { return JSON.parse(String(props.value)) as LinkValue } catch { return null }
})

function goToLinked() {
  if (!linkInfo.value || !props.linkTable) return
  router.push(`/tables/${props.linkTable}?highlight=${linkInfo.value.id}`)
}

const noteInfo = computed(() => {
  if (props.fieldType !== 'note') return null
  return decodeNoteValue(props.value)
})

const imageThumb = computed<string | null>(() => {
  if (props.fieldType !== 'image' || !props.value) return null
  try { return (JSON.parse(String(props.value)) as { thumb: string }).thumb } catch { return null }
})

const boolVal = computed(() => {
  if (typeof props.value === 'boolean') return props.value
  if (typeof props.value === 'number') return props.value !== 0
  if (typeof props.value === 'string') return props.value === '1' || props.value.toLowerCase() === 'true'
  return false
})

const selectOpt = computed<SelectOption | undefined>(() => {
  if (!props.selectOptions || !props.value) return undefined
  return props.selectOptions.find(o => o.value === String(props.value))
})

const numVal = computed(() => {
  if (props.value === null || props.value === undefined) return ''
  const n = Number(props.value)
  if (isNaN(n)) return String(props.value)
  return n.toLocaleString('zh-CN')
})

const currencyVal = computed(() => {
  if (props.value === null || props.value === undefined) return ''
  const n = Number(props.value)
  if (isNaN(n)) return String(props.value)
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
})

const percentVal = computed(() => {
  if (props.value === null || props.value === undefined) return ''
  const n = Number(props.value)
  if (isNaN(n)) return String(props.value)
  return n.toLocaleString('zh-CN') + '%'
})

function isUrl(v: unknown): boolean {
  if (!v) return false
  try {
    const u = new URL(String(v))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

function goToNote(noteId: string) {
  router.push(`/notes/${noteId}`)
}

function isEmail(v: unknown): boolean {
  if (!v) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
}

function toDate(v: unknown): Date | null {
  if (!v) return null
  const n = Number(v)
  if (!isNaN(n) && n > 0) {
    const d = new Date(n < 1e10 ? n * 1000 : n)
    if (!isNaN(d.getTime())) return d
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

const dateVal = computed(() => {
  if (!props.value) return ''
  const s = String(props.value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = toDate(props.value)
  if (!d) return s
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const datetimeVal = computed(() => {
  if (!props.value) return ''
  const d = toDate(props.value)
  if (!d) return String(props.value)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})
</script>

<style scoped>
.cell-empty {
  color: #ccc;
}
/* 表格模式：截断 */
.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.cell-longtext {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  line-height: 1.4;
}
.cell-link {
  color: #4f6ef7;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.cell-link:hover {
  text-decoration: underline;
}
/* 详情模式：完整显示 */
.cell-text--full,
.cell-longtext--full {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}
.cell-link--full {
  color: #4f6ef7;
  text-decoration: none;
  word-break: break-all;
  display: block;
}
.cell-link--full:hover {
  text-decoration: underline;
}
.cell-number {
  display: block;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cell-check-on {
  color: #18a058;
  font-weight: 700;
  font-size: 15px;
}
.cell-check-off {
  color: #bbb;
}
.cell-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  border: 1px solid;
  font-weight: 500;
}
.cell-link-record {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px 1px 6px;
  background: rgba(79, 110, 247, 0.08);
  border: 1px solid rgba(79, 110, 247, 0.25);
  border-radius: 4px;
  font-size: 12px;
  color: #4f6ef7;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.cell-link-record:hover {
  background: rgba(79, 110, 247, 0.14);
}
.cell-note {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px 1px 4px;
  background: rgba(55, 53, 47, 0.06);
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  font-size: 12px;
  color: #37352f;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.cell-note:hover {
  background: rgba(55, 53, 47, 0.1);
}
.cell-image {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 3px;
  display: block;
}
</style>
