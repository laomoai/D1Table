<template>
  <AppModal
    v-model:show="visible"
    title="Export Schema"
    width="clamp(460px, 35vw, 580px)"
    height="clamp(420px, 55vh, 620px)"
  >
    <div class="content">
      <p class="desc">Select tables to include in the exported CSV file.</p>

      <!-- Select All -->
      <label class="check-row all-row">
        <input
          type="checkbox"
          class="check-input"
          :checked="isAllSelected"
          :ref="(el) => { allCheckRef = el as HTMLInputElement | null }"
          @change="toggleAll"
        />
        <span class="all-label">Select All</span>
        <span class="count-tag">{{ selected.length }} / {{ allTableNames.length }}</span>
      </label>

      <div class="separator" />

      <!-- Groups with tables -->
      <template v-for="group in groupedData.withGroup" :key="group.id">
        <div class="group-block">
          <label class="check-row group-row">
            <input
              type="checkbox"
              class="check-input"
              :checked="isGroupAllSelected(group.tables)"
              :ref="(el) => setGroupRef(el as HTMLInputElement | null, group.id)"
              @change="toggleGroup(group.tables)"
            />
            <span class="group-label">{{ group.name }}</span>
          </label>
          <label
            v-for="t in group.tables"
            :key="t.name"
            class="check-row table-row"
          >
            <input
              type="checkbox"
              class="check-input"
              :checked="selected.includes(t.name)"
              @change="toggleTable(t.name)"
            />
            <span class="table-title">{{ t.title }}</span>
            <code class="table-name">{{ t.name }}</code>
          </label>
        </div>
      </template>

      <!-- Ungrouped -->
      <template v-if="groupedData.ungrouped.length">
        <div v-if="groupedData.withGroup.length" class="separator" />
        <div class="group-block">
          <div class="no-group-label">No group</div>
          <label
            v-for="t in groupedData.ungrouped"
            :key="t.name"
            class="check-row table-row"
          >
            <input
              type="checkbox"
              class="check-input"
              :checked="selected.includes(t.name)"
              @change="toggleTable(t.name)"
            />
            <span class="table-title">{{ t.title }}</span>
            <code class="table-name">{{ t.name }}</code>
          </label>
        </div>
      </template>
    </div>

    <template #footer>
      <span class="footer-count">{{ selected.length }} table{{ selected.length !== 1 ? 's' : '' }} selected</span>
      <button class="btn-cancel" @click="visible = false">Cancel</button>
      <button
        class="btn-export"
        :disabled="selected.length === 0 || exporting"
        @click="handleExport"
      >
        {{ exporting ? 'Exporting…' : 'Export CSV' }}
      </button>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue'
import { useMessage } from 'naive-ui'
import { api } from '@/api/client'
import type { TableMeta, Group } from '@/api/client'
import AppModal from './AppModal.vue'

const visible = defineModel<boolean>('show', { default: false })

const props = defineProps<{
  tables: TableMeta[]
  groups: Group[]
}>()

const message = useMessage()
const exporting = ref(false)
const selected = ref<string[]>([])

// Initialize with all tables selected when modal opens
watch(visible, (val) => {
  if (val) selected.value = props.tables.map(t => t.name)
})

// ── Computed ──────────────────────────────────────────────────

const allTableNames = computed(() => props.tables.map(t => t.name))
const isAllSelected = computed(() => selected.value.length === allTableNames.value.length && allTableNames.value.length > 0)
const isIndeterminate = computed(() => selected.value.length > 0 && !isAllSelected.value)

interface GroupedTable { name: string; title: string }
interface GroupEntry { id: number; name: string; tables: GroupedTable[] }

const groupedData = computed(() => {
  const groupedNames = new Set<string>()

  const withGroup: GroupEntry[] = props.groups
    .map(g => {
      const tables = g.tables
        .filter(tn => props.tables.some(t => t.name === tn))
        .map(tn => {
          const t = props.tables.find(t => t.name === tn)!
          groupedNames.add(tn)
          return { name: tn, title: t.title || tn }
        })
      return { id: g.id, name: g.name, tables }
    })
    .filter(g => g.tables.length > 0)

  const ungrouped = props.tables
    .filter(t => !groupedNames.has(t.name))
    .map(t => ({ name: t.name, title: t.title || t.name }))

  return { withGroup, ungrouped }
})

// ── Selection helpers ──────────────────────────────────────────

function toggleAll() {
  if (isAllSelected.value) selected.value = []
  else selected.value = [...allTableNames.value]
}

function toggleTable(name: string) {
  const idx = selected.value.indexOf(name)
  if (idx >= 0) selected.value.splice(idx, 1)
  else selected.value.push(name)
}

function isGroupAllSelected(tables: GroupedTable[]): boolean {
  return tables.length > 0 && tables.every(t => selected.value.includes(t.name))
}

function isGroupIndeterminate(tables: GroupedTable[]): boolean {
  const count = tables.filter(t => selected.value.includes(t.name)).length
  return count > 0 && count < tables.length
}

function toggleGroup(tables: GroupedTable[]) {
  if (isGroupAllSelected(tables)) {
    const names = new Set(tables.map(t => t.name))
    selected.value = selected.value.filter(n => !names.has(n))
  } else {
    const toAdd = tables.map(t => t.name).filter(n => !selected.value.includes(n))
    selected.value = [...selected.value, ...toAdd]
  }
}

// ── Indeterminate checkbox refs ────────────────────────────────

const allCheckRef = ref<HTMLInputElement | null>(null)
const groupCheckRefs = ref(new Map<number, HTMLInputElement>())

watchEffect(() => {
  if (allCheckRef.value) allCheckRef.value.indeterminate = isIndeterminate.value
  for (const group of groupedData.value.withGroup) {
    const el = groupCheckRefs.value.get(group.id)
    if (el) el.indeterminate = isGroupIndeterminate(group.tables)
  }
})

function setGroupRef(el: HTMLInputElement | null, groupId: number) {
  if (el) groupCheckRefs.value.set(groupId, el)
  else groupCheckRefs.value.delete(groupId)
}

// ── Export ────────────────────────────────────────────────────

function csvEscape(val: string): string {
  const s = String(val ?? '')
  return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

async function handleExport() {
  if (selected.value.length === 0) return
  exporting.value = true
  try {
    const names = [...selected.value]
    const fieldResults = await Promise.all(names.map(n => api.getFieldMeta(n)))

    const lines = ['Table Title,Table Name,Field Title,Field Name,Field Type']
    names.forEach((name, i) => {
      const tableTitle = props.tables.find(t => t.name === name)?.title ?? name
      for (const field of fieldResults[i]) {
        lines.push([
          csvEscape(tableTitle),
          csvEscape(name),
          csvEscape(field.title),
          csvEscape(field.column_name),
          csvEscape(field.field_type),
        ].join(','))
      }
    })

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schema_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    message.success('Exported successfully')
    visible.value = false
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.content {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.desc {
  font-size: 13px;
  color: #a3a19d;
  margin: 0 0 12px;
}

/* Shared check row */
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  border-radius: 3px;
  padding: 4px 6px;
  transition: background 0.1s;
  user-select: none;
}
.check-row:hover { background: rgba(55,53,47,0.04); }

.check-input {
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: #37352f;
}

/* Select All row */
.all-row { margin-bottom: 2px; }
.all-label {
  font-size: 13px;
  font-weight: 600;
  color: #37352f;
  flex: 1;
}
.count-tag {
  font-size: 12px;
  color: #a3a19d;
  background: #f3f3f1;
  padding: 1px 8px;
  border-radius: 10px;
}

.separator {
  height: 1px;
  background: #e9e9e7;
  margin: 8px 0;
}

/* Group block */
.group-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 4px;
}
.group-row { }
.group-label {
  font-size: 12px;
  font-weight: 600;
  color: #787774;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex: 1;
}
.no-group-label {
  font-size: 12px;
  font-weight: 600;
  color: #a3a19d;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 6px;
}

/* Table rows */
.table-row { padding-left: 24px; }
.table-title {
  font-size: 13px;
  color: #37352f;
  flex: 1;
}
.table-name {
  font-size: 11px;
  color: #a3a19d;
  background: #f3f3f1;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Menlo', monospace;
}

/* Footer */
.footer-count {
  font-size: 13px;
  color: #a3a19d;
  flex: 1;
}
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
.btn-export {
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
.btn-export:hover:not(:disabled) { background: #2f2d28; }
.btn-export:disabled { opacity: 0.4; cursor: default; }
</style>
