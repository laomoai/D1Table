<template>
  <div class="app-layout" :class="{ resizing: isResizing }">
    <!-- Sidebar -->
    <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="sidebar-header" @click="router.push('/')" style="cursor:pointer;">
        <img src="/logo.png" class="logo-img" alt="D1Table" />
        <span class="logo">D1Table</span>
      </div>

      <!-- Tab bar -->
      <div class="sidebar-tabs">
        <button
          class="sidebar-tab"
          :class="{ active: sidebarTab === 'tables' }"
          @click="sidebarTab = 'tables'"
        >
          <n-icon :component="TableIcon" size="14" />
          <span>Tables</span>
        </button>
        <button
          class="sidebar-tab"
          :class="{ active: sidebarTab === 'notes' }"
          @click="sidebarTab = 'notes'"
        >
          <n-icon :component="NotesIcon" size="14" />
          <span>Notes</span>
        </button>
      </div>

      <!-- Scrollable content area -->
      <div class="sidebar-scroll">
        <!-- ════ Tables panel ════ -->
        <div v-show="sidebarTab === 'tables'" class="table-list">
          <!-- Grouped tables -->
          <template v-for="group in groupedTables" :key="group.id">
            <div
              class="group-header"
              draggable="true"
              @click="toggleGroup(group.id)"
              @dragstart.stop="onGroupDragStart($event, group.id)"
              @dragover.prevent="onGroupDragOver"
              @drop.stop="onGroupDrop($event, group.id)"
              @dragend="onGroupDragEnd"
              :class="{ 'drag-target': draggedGroupId !== null && draggedGroupId !== group.id }"
            >
              <span class="group-arrow" :class="{ expanded: expandedGroups.has(group.id) }">›</span>
              <HoverTooltipText
                :text="group.name"
                class-name="group-name"
              />
              <span class="group-count">{{ group.tables.length }}</span>
            </div>
            <template v-if="expandedGroups.has(group.id)">
              <div
                v-for="table in sortedTables(group.tables)"
                :key="table.name"
                class="table-item grouped"
                :style="tableItemStyle"
                :class="{ active: activeTable === table.name }"
                draggable="true"
                @click="navigateToTable(table.name)"
                @dragstart="onDragStart($event, table.name)"
                @dragover="onDragOver"
                @drop="onDrop($event, table.name)"
                @dragend="onDragEnd"
              >
                <span class="table-icon-cell">
                  <IonIcon v-if="table.icon && table.icon.startsWith('ion:')" :name="table.icon.slice(4)" :size="14" />
                  <span v-else-if="table.icon" class="table-emoji-icon">{{ table.icon }}</span>
                  <IonIcon v-else name="GridOutline" :size="14" />
                </span>
                <template v-if="editingTable === table.name">
                  <input
                    v-model="editTableTitle"
                    class="table-name-input"
                    @keyup.enter="saveTableTitle(table)"
                    @keyup.escape="cancelTableEdit"
                    @blur="saveTableTitle(table)"
                    @click.stop
                    ref="tableEditInputRef"
                  />
                </template>
                <template v-else>
                  <HoverTooltipText
                    :text="table.title || table.name"
                    class-name="table-name"
                    @dblclick.stop="startTableEdit(table)"
                  />
                </template>
              </div>
            </template>
          </template>

          <!-- Ungrouped tables -->
          <template v-if="ungroupedTables.length > 0">
            <div
              v-if="groupedTables.length > 0"
              class="group-header"
              @click="toggleGroup(-1)"
            >
              <span class="group-arrow" :class="{ expanded: expandedGroups.has(-1) }">›</span>
              <span class="group-name">Ungrouped</span>
              <span class="group-count">{{ ungroupedTables.length }}</span>
            </div>
            <template v-if="groupedTables.length === 0 || expandedGroups.has(-1)">
              <div
                v-for="table in sortedTables(ungroupedTables)"
                :key="table.name"
                class="table-item"
                :style="tableItemStyle"
                :class="{ active: activeTable === table.name, grouped: groupedTables.length > 0 }"
                draggable="true"
                @click="navigateToTable(table.name)"
                @dragstart="onDragStart($event, table.name)"
                @dragover="onDragOver"
                @drop="onDrop($event, table.name)"
                @dragend="onDragEnd"
              >
                <span class="table-icon-cell">
                  <IonIcon v-if="table.icon && table.icon.startsWith('ion:')" :name="table.icon.slice(4)" :size="14" />
                  <span v-else-if="table.icon" class="table-emoji-icon">{{ table.icon }}</span>
                  <IonIcon v-else name="GridOutline" :size="14" />
                </span>
                <template v-if="editingTable === table.name">
                  <input
                    v-model="editTableTitle"
                    class="table-name-input"
                    @keyup.enter="saveTableTitle(table)"
                    @keyup.escape="cancelTableEdit"
                    @blur="saveTableTitle(table)"
                    @click.stop
                    ref="tableEditInputRef"
                  />
                </template>
                <template v-else>
                  <HoverTooltipText
                    :text="table.title || table.name"
                    class-name="table-name"
                    @dblclick.stop="startTableEdit(table)"
                  />
                </template>
              </div>
            </template>
          </template>
        </div>

        <!-- ════ Notes panel ════ -->
        <div v-show="sidebarTab === 'notes'" class="notes-panel">
          <div class="panel-header">
            <input v-model="noteSearch" class="panel-search-input" :style="noteSearchStyle" placeholder="Search..." />
            <button class="panel-add-btn" @click="createNewNote" title="New Note">+</button>
          </div>
          <div class="panel-list">
            <n-spin v-if="notesTreeLoading" size="small" style="padding: 20px; display: flex; justify-content: center;" />
            <div v-else-if="sidebarVisibleRootNotes.length === 0" class="panel-empty">
              {{ noteSearch ? 'No matching notes' : 'No notes yet' }}
            </div>
            <template v-else>
              <NoteTreeItem
                v-for="note in sidebarVisibleRootNotes"
                :key="note.id"
                :note="note"
                :children="sidebarVisibleChildrenMap.get(note.id) ?? []"
                :children-map="sidebarVisibleChildrenMap"
                :active-id="activeNoteId"
                :expanded-ids="sidebarExpandedNoteIds"
                :item-style="noteItemStyle"
                :drop-target-id="noteDropState.id"
                :drop-position="noteDropState.position"
                @select="selectNote"
                @toggle="toggleNoteFolder"
                @create-child="createChildNote"
                @archive="archiveNote"
                @reorder="handleNoteReorder"
                @update:drop-state="noteDropState = $event"
              />
            </template>
          </div>
        </div>

        <!-- Knowledge Base entry -->
        <div
          v-show="sidebarTab === 'notes'"
          class="kb-entry"
          :class="{ active: route.path === '/knowledge-base' }"
          @click="router.push('/knowledge-base')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span>Knowledge Base</span>
          <span v-if="archivedRoots?.length" class="kb-badge">{{ archivedRoots.length }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="sidebar-footer">
        <transition name="menu-slide">
          <div v-if="showUserMenu" class="user-menu">
            <div class="user-menu-item" @click="handleMenuItem('settings')">
              <n-icon :component="SettingsIcon" size="16" />
              <span>Settings</span>
            </div>
            <div class="user-menu-divider" />
            <div class="user-menu-item" @click="handleMenuItem('logout')">
              <n-icon :component="LogoutIcon" size="16" />
              <span>Logout</span>
            </div>
          </div>
        </transition>
        <div v-if="currentUser" class="user-trigger" @click="showUserMenu = !showUserMenu">
          <img
            :src="currentUser.picture"
            class="user-avatar"
            referrerpolicy="no-referrer"
            :alt="currentUser.name"
          />
          <div class="user-details">
            <div class="user-name">{{ currentUser.name }}</div>
            <div class="user-email">{{ currentUser.email }}</div>
          </div>
          <span class="user-chevron">⋯</span>
        </div>
      </div>
    </aside>

    <!-- Resize handle -->
    <div
      class="resize-handle"
      :class="{ active: isResizing }"
      @mousedown.prevent="startResize"
    />

    <!-- Main content area -->
    <main class="main-content">
      <router-view />
    </main>

    <NotePreviewModal />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NIcon, NSpin, useMessage } from 'naive-ui'
import {
  GridOutline as TableIcon,
  SettingsOutline as SettingsIcon,
  LogOutOutline as LogoutIcon,
  DocumentTextOutline as NotesIcon,
} from '@vicons/ionicons5'
import { api, notesApi, http, type TableMeta, type NoteListItem } from '@/api/client'
import { getCachedUser, resetAuthState } from '@/router'
import { registerClipboardToast } from '@/utils/clipboard'
import HoverTooltipText from './HoverTooltipText.vue'
import IonIcon from './IonIcon.vue'
import NoteTreeItem from './NoteTreeItem.vue'
import NotePreviewModal from './NotePreviewModal.vue'

const message = useMessage()
registerClipboardToast((content, opts) => message.success(content, opts))
const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()
const RECENT_KEY = 'd1table_recent_access'

// ── Sidebar resize ──────────────────────────────────────────────
const SIDEBAR_WIDTH_KEY = 'd1table_sidebar_width'
const sidebarWidth = ref(parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? '220'))
const isResizing = ref(false)

function startResize(e: MouseEvent) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  const onMouseMove = (ev: MouseEvent) => {
    sidebarWidth.value = Math.max(180, Math.min(480, startWidth + ev.clientX - startX))
  }
  const onMouseUp = () => {
    isResizing.value = false
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// ── Sidebar tab ─────────────────────────────────────────────────
const SIDEBAR_TAB_KEY = 'd1table_sidebar_tab'
const sidebarTab = ref<'tables' | 'notes'>(
  route.path.startsWith('/notes') ? 'notes'
    : route.path.startsWith('/tables') ? 'tables'
    : (localStorage.getItem(SIDEBAR_TAB_KEY) as 'tables' | 'notes') ?? 'tables'
)

watch(sidebarTab, (tab) => localStorage.setItem(SIDEBAR_TAB_KEY, tab))

watch(() => route.path, (path) => {
  if (path.startsWith('/notes')) sidebarTab.value = 'notes'
  else if (path.startsWith('/tables')) sidebarTab.value = 'tables'
})

// ── Tables ──────────────────────────────────────────────────────
const { data: tables } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

const { data: groups } = useQuery({
  queryKey: ['groups'],
  queryFn: api.getGroups,
  retry: false,
})

const activeTable = computed(() => {
  const match = route.params.tableName
  return typeof match === 'string' ? match : null
})

// ── Group collapse（持久化到 localStorage）──────────────────────────
const EXPANDED_GROUPS_KEY = 'd1table_expanded_groups'

function loadExpandedGroups(): Set<number> {
  try {
    const raw = localStorage.getItem(EXPANDED_GROUPS_KEY)
    if (raw) return new Set(JSON.parse(raw) as number[])
  } catch { /* ignore */ }
  return new Set([-1])
}

const expandedGroups = reactive(loadExpandedGroups())

function savePreferencesToServer() {
  api.savePreferences({
    table_order: tableOrder.value,
    expanded_groups: [...expandedGroups],
    group_order: groupOrder.value,
  }).catch(() => { /* localStorage is the fallback */ })
}

onMounted(async () => {
  try {
    const prefs = await api.getPreferences()
    if (Array.isArray(prefs.table_order) && (prefs.table_order as string[]).length > 0) {
      tableOrder.value = prefs.table_order as string[]
      localStorage.setItem('d1table_table_order', JSON.stringify(prefs.table_order))
    }
    if (Array.isArray(prefs.expanded_groups)) {
      expandedGroups.clear()
      ;(prefs.expanded_groups as number[]).forEach(id => expandedGroups.add(id))
      localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify(prefs.expanded_groups))
    }
    if (Array.isArray(prefs.group_order) && (prefs.group_order as number[]).length > 0) {
      groupOrder.value = prefs.group_order as number[]
      localStorage.setItem('d1table_group_order', JSON.stringify(prefs.group_order))
    }
  } catch { /* fallback to localStorage values already loaded */ }
})

function toggleGroup(id: number) {
  if (expandedGroups.has(id)) expandedGroups.delete(id)
  else expandedGroups.add(id)
  localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...expandedGroups]))
  savePreferencesToServer()
}

// ── 分组排序 ────────────────────────────────────────────────────
const groupOrder = ref<number[]>(
  JSON.parse(localStorage.getItem('d1table_group_order') ?? 'null') ?? []
)

const draggedGroupId = ref<number | null>(null)

function onGroupDragStart(e: DragEvent, id: number) {
  draggedGroupId.value = id
  e.dataTransfer!.effectAllowed = 'move'
}

function onGroupDragOver(e: DragEvent) {
  e.dataTransfer!.dropEffect = 'move'
}

function onGroupDrop(e: DragEvent, targetId: number) {
  e.preventDefault()
  if (!draggedGroupId.value || draggedGroupId.value === targetId) return

  const currentOrder = groupedTables.value.map(g => g.id)
  const from = currentOrder.indexOf(draggedGroupId.value)
  const to = currentOrder.indexOf(targetId)
  if (from === -1 || to === -1) return

  currentOrder.splice(from, 1)
  currentOrder.splice(to, 0, draggedGroupId.value)

  groupOrder.value = currentOrder
  localStorage.setItem('d1table_group_order', JSON.stringify(currentOrder))
  draggedGroupId.value = null
  savePreferencesToServer()
}

function onGroupDragEnd() {
  draggedGroupId.value = null
}

function sortGroups<T extends { id: number }>(list: T[]): T[] {
  if (!groupOrder.value.length) return list
  const idx = (id: number) => {
    const i = groupOrder.value.indexOf(id)
    return i === -1 ? 9999 : i
  }
  return [...list].sort((a, b) => idx(a.id) - idx(b.id))
}

// Compute grouped table list
const groupedTables = computed(() => {
  if (!groups.value || !tables.value || groups.value.length === 0) return []

  const result = groups.value
    .filter(g => g.tables.length > 0)
    .map(g => {
      if (!expandedGroups.has(g.id) && !localStorage.getItem(EXPANDED_GROUPS_KEY)) {
        expandedGroups.add(g.id)
        localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...expandedGroups]))
      }
      return {
        id: g.id,
        name: g.name,
        tables: tables.value!.filter(t => g.tables.includes(t.name)),
      }
    })
    .filter(g => g.tables.length > 0)
  return sortGroups(result)
})

const ungroupedTables = computed(() => {
  if (!tables.value) return []
  if (!groups.value || groups.value.length === 0) return tables.value

  const groupedNames = new Set(groups.value.flatMap(g => g.tables))
  return tables.value.filter(t => !groupedNames.has(t.name))
})

function navigateToTable(name: string) {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') as Record<string, number>
    recent[name] = Date.now()
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ [name]: Date.now() }))
  }
  router.push(`/tables/${name}`)
}

// ── Inline edit table display name ──────────────────────────────────────────
const editingTable = ref<string | null>(null)
const editTableTitle = ref('')
const tableEditInputRef = ref<HTMLInputElement>()

function startTableEdit(table: TableMeta) {
  editingTable.value = table.name
  editTableTitle.value = table.title || table.name
  nextTick(() => tableEditInputRef.value?.focus())
}

function cancelTableEdit() {
  editingTable.value = null
}

async function saveTableTitle(table: TableMeta) {
  const newTitle = editTableTitle.value.trim()
  if (!newTitle || newTitle === (table.title || table.name)) {
    cancelTableEdit()
    return
  }
  try {
    await api.updateTableTitle(table.name, newTitle)
    message.success('Table name updated')
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
  cancelTableEdit()
}

// ── 拖拽排序 ────────────────────────────────────────────────────────
const tableOrder = ref<string[]>(
  JSON.parse(localStorage.getItem('d1table_table_order') ?? 'null') ?? []
)

function sortedTables(list: TableMeta[]) {
  if (!tableOrder.value.length) return list
  const idx = (name: string) => {
    const i = tableOrder.value.indexOf(name)
    return i === -1 ? 9999 : i
  }
  return [...list].sort((a, b) => idx(a.name) - idx(b.name))
}

const draggedTable = ref<string | null>(null)

function onDragStart(e: DragEvent, name: string) {
  draggedTable.value = name
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

function onDrop(e: DragEvent, targetName: string) {
  e.preventDefault()
  if (!draggedTable.value || draggedTable.value === targetName) return

  const allTableNames = [
    ...groupedTables.value.flatMap(g => g.tables.map(t => t.name)),
    ...ungroupedTables.value.map(t => t.name),
  ]
  const order = tableOrder.value.length
    ? [...new Set([...tableOrder.value, ...allTableNames])]
    : [...allTableNames]

  const from = order.indexOf(draggedTable.value)
  const to = order.indexOf(targetName)
  if (from === -1 || to === -1) return

  order.splice(from, 1)
  order.splice(to, 0, draggedTable.value)

  tableOrder.value = order
  localStorage.setItem('d1table_table_order', JSON.stringify(order))
  draggedTable.value = null
  savePreferencesToServer()
}

function onDragEnd() {
  draggedTable.value = null
}

// ── 侧边栏外观偏好 ────────────────────────────────────────
const SIDEBAR_PREFS_KEY = 'd1table_sidebar_prefs'

function loadSidebarPrefs() {
  try {
    const raw = localStorage.getItem(SIDEBAR_PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const sidebarPrefs = ref(loadSidebarPrefs())

function onStorageChange(e: StorageEvent) {
  if (e.key === SIDEBAR_PREFS_KEY) {
    sidebarPrefs.value = loadSidebarPrefs()
  }
}
window.addEventListener('storage', onStorageChange)
onUnmounted(() => window.removeEventListener('storage', onStorageChange))

const tableItemStyle = computed(() => ({
  fontSize: `${sidebarPrefs.value.fontSize ?? 14}px`,
  color: sidebarPrefs.value.textColor ?? '#37352f',
}))

const noteItemStyle = computed(() => ({
  fontSize: `${sidebarPrefs.value.fontSize ?? 14}px`,
  color: sidebarPrefs.value.textColor ?? '#37352f',
}))

const noteSearchStyle = computed(() => ({
  fontSize: `${Math.max(12, (sidebarPrefs.value.fontSize ?? 14) - 1)}px`,
  color: sidebarPrefs.value.textColor ?? '#37352f',
}))

// ── Notes tree ──────────────────────────────────────────────────
const { data: notesTree, isLoading: notesTreeLoading } = useQuery({
  queryKey: ['notes', 'tree'],
  queryFn: notesApi.getTree,
})

const { data: archivedRoots } = useQuery({
  queryKey: ['notes', 'archived-roots'],
  queryFn: () => notesApi.getArchivedRoots(),
})

// Set of root IDs that have archived children
const archivedRootIds = computed(() =>
  new Set((archivedRoots.value ?? []).map(r => r.id))
)

const noteRootNotes = computed(() => {
  const roots = (notesTree.value ?? []).filter(n => !n.parent_id)
  // Hide root notes whose children are all archived:
  // root appears in archivedRootIds AND has no visible children in the tree
  return roots.filter(root => {
    if (!archivedRootIds.value.has(root.id)) return true
    // Check if root has any visible children in the tree
    const hasVisibleChildren = (notesTree.value ?? []).some(n => n.parent_id === root.id)
    return hasVisibleChildren
  })
})

const noteChildrenMap = computed(() => {
  const map = new Map<string, NoteListItem[]>()
  for (const n of notesTree.value ?? []) {
    if (n.parent_id) {
      const arr = map.get(n.parent_id) ?? []
      arr.push(n)
      map.set(n.parent_id, arr)
    }
  }
  return map
})

// Notes expanded folders persistence
const NOTE_EXPANDED_KEY = 'd1table_note_expanded'
function loadNoteExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTE_EXPANDED_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}
const noteExpandedFolders = ref(loadNoteExpanded())

function saveNoteExpanded() {
  localStorage.setItem(NOTE_EXPANDED_KEY, JSON.stringify([...noteExpandedFolders.value]))
}

function toggleNoteFolder(id: string) {
  if (noteExpandedFolders.value.has(id)) noteExpandedFolders.value.delete(id)
  else noteExpandedFolders.value.add(id)
  saveNoteExpanded()
}

// Notes search
const noteSearch = ref('')

const sidebarVisibleNoteIds = computed(() => {
  const query = noteSearch.value.trim().toLowerCase()
  if (!query) return null

  const notes = notesTree.value ?? []
  const byId = new Map(notes.map((note) => [note.id, note]))
  const visible = new Set<string>()

  for (const note of notes) {
    if (!note.title.toLowerCase().includes(query)) continue
    let current: NoteListItem | undefined = note
    while (current) {
      visible.add(current.id)
      current = current.parent_id ? byId.get(current.parent_id) : undefined
    }
  }

  return visible
})

const sidebarVisibleChildrenMap = computed(() => {
  const visibleIds = sidebarVisibleNoteIds.value
  if (!visibleIds) return noteChildrenMap.value

  const map = new Map<string, NoteListItem[]>()
  for (const [parentId, children] of noteChildrenMap.value.entries()) {
    const filteredChildren = children.filter((child) => visibleIds.has(child.id))
    if (filteredChildren.length > 0) {
      map.set(parentId, filteredChildren)
    }
  }
  return map
})

const sidebarVisibleRootNotes = computed(() => {
  const visibleIds = sidebarVisibleNoteIds.value
  if (!visibleIds) return noteRootNotes.value
  return noteRootNotes.value.filter((note) => visibleIds.has(note.id))
})

const sidebarExpandedNoteIds = computed(() => {
  if (!sidebarVisibleNoteIds.value) return noteExpandedFolders.value
  return new Set([...noteExpandedFolders.value, ...sidebarVisibleNoteIds.value])
})

// Active note from route
const activeNoteId = computed(() => {
  const id = route.params.noteId
  return typeof id === 'string' ? id : null
})

function selectNote(id: string) {
  router.push(`/notes/${id}`)
}

// Notes CRUD
async function createNewNote() {
  try {
    const result = await notesApi.createNote({ title: 'Untitled' })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    router.push(`/notes/${result.id}`)
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function archiveNote(noteId: string) {
  try {
    await notesApi.archiveNote(noteId)
    message.success('Archived')
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    queryClient.invalidateQueries({ queryKey: ['notes', 'archived-roots'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function createChildNote(parentId: string) {
  try {
    const result = await notesApi.createNote({ title: 'Untitled', parent_id: parentId })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    noteExpandedFolders.value.add(parentId)
    saveNoteExpanded()
    router.push(`/notes/${result.id}`)
  } catch (err) {
    message.error((err as Error).message)
  }
}

// Notes drag reorder
const noteDropState = ref<{ id: string | null; position: 'above' | 'child' | null }>({
  id: null, position: null,
})

async function handleNoteReorder({ dragId, dropId, mode }: { dragId: string; dropId: string; mode: 'above' | 'child' }) {
  const allNotes = notesTree.value ?? []
  const dropNote = allNotes.find(n => n.id === dropId)
  if (!dropNote) return

  try {
    if (mode === 'child') {
      await notesApi.updateNote(dragId, { parent_id: dropId, sort_order: 0 })
      noteExpandedFolders.value.add(dropId)
      saveNoteExpanded()
    } else {
      const siblings = allNotes
        .filter(n => n.parent_id === dropNote.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order)
      const dropIndex = siblings.findIndex(n => n.id === dropId)
      const prevOrder = dropIndex > 0 ? siblings[dropIndex - 1].sort_order : dropNote.sort_order - 1000
      const gap = dropNote.sort_order - prevOrder

      if (gap <= 1) {
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i].id !== dragId) {
            await notesApi.updateNote(siblings[i].id, { sort_order: (i + 1) * 1000 })
          }
        }
        const newDropIndex = siblings.findIndex(n => n.id === dropId)
        const newOrder = newDropIndex > 0 ? newDropIndex * 1000 - 500 : 500
        await notesApi.updateNote(dragId, { sort_order: newOrder, parent_id: dropNote.parent_id ?? null })
      } else {
        const newOrder = Math.floor((prevOrder + dropNote.sort_order) / 2)
        await notesApi.updateNote(dragId, { sort_order: newOrder, parent_id: dropNote.parent_id ?? null })
      }
    }
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

// ── User menu ───────────────────────────────────────────────────
const currentUser = computed(() => getCachedUser())
const showUserMenu = ref(false)

function handleMenuItem(key: string) {
  showUserMenu.value = false
  if (key === 'settings') router.push('/settings')
  if (key === 'logout') logout()
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as Element).closest('.sidebar-footer')) {
    showUserMenu.value = false
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

async function logout() {
  try {
    await http.post('/auth/logout')
  } catch { /* ignore */ }
  resetAuthState()
  router.replace('/login')
}
</script>

<style scoped>
/* ── Layout ────────────────────────────────────────────────── */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.app-layout.resizing {
  cursor: col-resize;
  user-select: none;
}
.sidebar {
  display: flex;
  flex-direction: column;
  background: #f7f7f5;
  border-right: 1px solid #e9e9e7;
  flex-shrink: 0;
  min-width: 180px;
  max-width: 480px;
}
.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.12) transparent;
}
.sidebar-scroll::-webkit-scrollbar { width: 6px; }
.sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
.sidebar-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s;
  position: relative;
  z-index: 10;
  margin-left: -2px;
  margin-right: -2px;
}
.resize-handle:hover,
.resize-handle.active {
  background: rgba(55, 53, 47, 0.15);
}
.main-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* ── Header ────────────────────────────────────────────────── */
.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid #e9e9e7;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.logo-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex-shrink: 0;
  opacity: 0.85;
}
.logo {
  font-size: 16px;
  font-weight: 700;
  color: #37352f;
  letter-spacing: 0;
}

/* ── Tabs ──────────────────────────────────────────────────── */
.sidebar-tabs {
  display: flex;
  padding: 6px 8px;
  gap: 2px;
  flex-shrink: 0;
  border-bottom: 1px solid #e9e9e7;
}
.sidebar-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #787774;
  transition: background 0.12s, color 0.12s;
}
.sidebar-tab:hover {
  background: rgba(55, 53, 47, 0.06);
  color: #37352f;
}
.sidebar-tab.active {
  background: rgba(55, 53, 47, 0.1);
  color: #37352f;
}

/* ── Tables panel ──────────────────────────────────────────── */
.table-list {
  padding: 8px 0;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  cursor: pointer;
  color: #787774;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}
.group-header:hover { color: #37352f; }
.group-header[draggable="true"] { cursor: grab; }
.group-header[draggable="true"]:active { cursor: grabbing; }
.group-header.drag-target {
  border-top: 2px solid #4f6ef7;
  padding-top: 4px;
}
.group-arrow {
  font-size: 12px;
  transition: transform 0.15s;
  display: inline-block;
  width: 10px;
}
.group-arrow.expanded { transform: rotate(90deg); }
.group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-count {
  font-size: 10px;
  background: rgba(55, 53, 47, 0.06);
  padding: 1px 5px;
  border-radius: 8px;
  color: #787774;
}
.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  cursor: pointer;
  border-radius: 3px;
  margin: 0 6px;
  transition: background 0.12s;
}
.table-item.grouped { padding-left: 28px; }
.table-item:hover { background: rgba(55, 53, 47, 0.08); }
.table-item.active {
  background: rgba(55, 53, 47, 0.1);
  font-weight: 500;
}
.table-icon { flex-shrink: 0; opacity: 0.5; }
.table-item.active .table-icon { opacity: 0.8; }
.table-icon-cell {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: #37352f;
}
.table-emoji-icon { font-size: 14px; line-height: 1; }
.table-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-name-input {
  flex: 1;
  background: #fff;
  border: 1px solid #b3b0ab;
  border-radius: 3px;
  color: #37352f;
  padding: 2px 6px;
  font-size: 13px;
  outline: none;
  min-width: 0;
}
.table-item[draggable="true"] { cursor: grab; }
.table-item[draggable="true"]:active { cursor: grabbing; }

/* ── Notes panel ───────────────────────────────────────────── */
.notes-panel {
  padding: 0;
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
}
.panel-search-input {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  font-size: 12px;
  color: #37352f;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}
.panel-search-input:focus { border-color: #b3b0ab; }
.panel-search-input::placeholder { color: #b3b0ab; }
.panel-add-btn {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  width: 26px;
  height: 26px;
  font-size: 16px;
  color: #787774;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.1s;
}
.panel-add-btn:hover {
  background: rgba(55, 53, 47, 0.08);
  color: #37352f;
}
.panel-list {
  padding: 0 4px;
}
.panel-empty {
  padding: 20px 16px;
  text-align: center;
  font-size: 13px;
  color: #a3a19d;
}

.kb-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: #787774;
  cursor: pointer;
  border-top: 1px solid #e9e9e7;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}
.kb-entry:hover {
  background: #f1f1ef;
  color: #37352f;
}
.kb-entry.active {
  color: #37352f;
  background: #f1f1ef;
}
.kb-badge {
  font-size: 11px;
  background: #e9e9e7;
  color: #787774;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: auto;
}

/* ── Footer ────────────────────────────────────────────────── */
.sidebar-footer {
  flex-shrink: 0;
  border-top: 1px solid #e9e9e7;
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.12s;
}
.user-trigger:hover { background: rgba(55, 53, 47, 0.06); }
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
}
.user-details { min-width: 0; flex: 1; }
.user-name {
  font-size: 13px;
  color: #37352f;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-email {
  font-size: 11px;
  color: #787774;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-chevron {
  font-size: 16px;
  color: #a3a19d;
  flex-shrink: 0;
  letter-spacing: -2px;
}
.user-menu {
  background: #fff;
  border: 1px solid #e9e9e7;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
  overflow: hidden;
}
.user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  font-size: 13px;
  color: #37352f;
  cursor: pointer;
  transition: background 0.1s;
}
.user-menu-item:hover { background: rgba(55,53,47,0.06); }
.user-menu-divider { height: 1px; background: #e9e9e7; }
.menu-slide-enter-active, .menu-slide-leave-active { transition: transform 0.12s, opacity 0.12s; }
.menu-slide-enter-from, .menu-slide-leave-to { transform: translateY(6px); opacity: 0; }
</style>
