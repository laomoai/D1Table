<template>
  <div class="fh-wrap" @click="onSortClick" @contextmenu.prevent="openMenu">
    <span class="fh-icon" :style="{ color: typeColor }">{{ typeIcon }}</span>

    <template v-if="renaming">
      <input
        ref="inputRef"
        v-model="renameVal"
        class="fh-input"
        @keyup.enter="confirmRename"
        @keyup.escape="cancelRename"
        @blur="confirmRename"
        @click.stop
      />
    </template>
    <span v-else class="fh-title" @dblclick.stop="startRename">
      {{ params.displayName }}
    </span>

    <span v-if="sortState" class="fh-sort">{{ sortState === 'asc' ? '↑' : '↓' }}</span>
  </div>

  <!-- 右键菜单 -->
  <n-dropdown
    trigger="manual"
    :show="showMenu"
    :x="menuX"
    :y="menuY"
    :options="menuOptions"
    @select="onMenuSelect"
    @clickoutside="showMenu = false"
  />
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { NDropdown } from 'naive-ui'
import type { FieldMeta, FieldType } from '@/api/client'

const props = defineProps<{
  params: {
    displayName: string
    column: {
      getSort: () => string | null | undefined
      isSortAscending: () => boolean
      isSortDescending: () => boolean
      addEventListener: (event: string, fn: () => void) => void
      removeEventListener: (event: string, fn: () => void) => void
    }
    progressSort: (multiSort: boolean) => void
    // custom params
    field: FieldMeta
    onRename: (title: string) => void
    onToggleHidden: () => void
    onDeleteField: () => void
  }
}>()

// ── Sort ──────────────────────────────────────────────────────
const sortState = ref<'asc' | 'desc' | null>(null)

function updateSort() {
  const s = props.params.column.getSort?.()
  sortState.value = s === 'asc' ? 'asc' : s === 'desc' ? 'desc' : null
}

function onSortClick() {
  if (!renaming.value) {
    props.params.progressSort(false)
  }
}

onMounted(() => {
  props.params.column.addEventListener('sortChanged', updateSort)
  updateSort()
})

onBeforeUnmount(() => {
  props.params.column.removeEventListener('sortChanged', updateSort)
})

// ── Rename ─────────────────────────────────────────────────────
const renaming = ref(false)
const renameVal = ref('')
const inputRef = ref<HTMLInputElement>()

function startRename() {
  renameVal.value = props.params.displayName
  renaming.value = true
  nextTick(() => inputRef.value?.focus())
}

function cancelRename() {
  renaming.value = false
}

function confirmRename() {
  const v = renameVal.value.trim()
  if (v && v !== props.params.displayName) {
    props.params.onRename(v)
  }
  renaming.value = false
}

// ── Context menu ───────────────────────────────────────────────
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function openMenu(e: MouseEvent) {
  menuX.value = e.clientX
  menuY.value = e.clientY
  showMenu.value = true
}

const menuOptions = computed(() => [
  { label: 'Rename', key: 'rename' },
  { label: props.params.field?.is_hidden ? 'Show field' : 'Hide field', key: 'toggle' },
  { type: 'divider', key: 'd' },
  { label: 'Delete field', key: 'delete', props: { style: 'color:#d03050' } },
])

function onMenuSelect(key: string) {
  showMenu.value = false
  if (key === 'rename') startRename()
  else if (key === 'toggle') props.params.onToggleHidden()
  else if (key === 'delete') props.params.onDeleteField()
}

// ── Type icon & color ──────────────────────────────────────────
const iconMap: Record<string, string> = {
  text: 'T', longtext: '¶', number: '#', currency: '¥', percent: '%',
  email: '@', url: '🔗', date: '📅', datetime: '🕐', checkbox: '☑', select: '◉',
}
const colorMap: Record<string, string> = {
  text: '#666', longtext: '#888', number: '#4f6ef7', currency: '#18a058', percent: '#f0a020',
  email: '#00adb5', url: '#4f6ef7', date: '#8a2be2', datetime: '#d03050',
  checkbox: '#18a058', select: '#f0a020',
}

const ft = computed(() => props.params.field?.field_type as FieldType | undefined)
const typeIcon = computed(() => ft.value ? (iconMap[ft.value] ?? 'T') : 'T')
const typeColor = computed(() => ft.value ? (colorMap[ft.value] ?? '#666') : '#666')
</script>

<style scoped>
.fh-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  height: 100%;
  padding: 0 4px;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
}
.fh-icon {
  font-size: 11px;
  font-weight: 700;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.fh-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: #333;
}
.fh-input {
  flex: 1;
  border: 1px solid #4f6ef7;
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 12px;
  outline: none;
  min-width: 0;
}
.fh-sort {
  color: #4f6ef7;
  font-size: 11px;
  flex-shrink: 0;
}
</style>
