<template>
  <n-layout style="height: 100vh" has-sider>
    <!-- Left sidebar -->
    <n-layout-sider
      bordered
      :width="220"
      :collapsed-width="0"
      collapse-mode="width"
      show-trigger="arrow-circle"
      :native-scrollbar="false"
      style="background: #f7f7f5;"
    >
      <div class="sidebar-header" @click="router.push('/')" style="cursor:pointer;">
        <img src="/logo.png" class="logo-img" alt="D1Table" />
        <span class="logo">D1Table</span>
      </div>

      <!-- Notes entry -->
      <div
        class="nav-item"
        :class="{ active: route.path.startsWith('/notes') }"
        @click="router.push('/notes')"
      >
        <n-icon :component="NotesIcon" size="16" style="opacity: 0.7" />
        <span>Notes</span>
      </div>

      <!-- Groups + table list -->
      <div class="table-list">
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
            <span class="group-name">{{ group.name }}</span>
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
                <span v-if="table.icon && !table.icon.startsWith('ion:')" class="table-emoji-icon">{{ table.icon }}</span>
                <ion-icon v-else-if="table.icon" :name="table.icon.slice(4)" :size="14" />
                <n-icon v-else :component="TableIcon" size="14" style="opacity:0.5" />
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
                <span class="table-name" @dblclick.stop="startTableEdit(table)">
                  {{ table.title || table.name }}
                </span>
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
                <span v-if="table.icon && !table.icon.startsWith('ion:')" class="table-emoji-icon">{{ table.icon }}</span>
                <ion-icon v-else-if="table.icon" :name="table.icon.slice(4)" :size="14" />
                <n-icon v-else :component="TableIcon" size="14" style="opacity:0.5" />
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
                <span class="table-name" @dblclick.stop="startTableEdit(table)">
                  {{ table.title || table.name }}
                </span>
              </template>
            </div>
          </template>
        </template>
      </div>

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
    </n-layout-sider>

    <!-- Main content area -->
    <n-layout-content>
      <router-view />
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NLayout, NLayoutSider, NLayoutContent, NButton, NIcon } from 'naive-ui'
import { GridOutline as TableIcon, SettingsOutline as SettingsIcon, LogOutOutline as LogoutIcon, DocumentTextOutline as NotesIcon } from '@vicons/ionicons5'
import { api, http, type TableMeta } from '@/api/client'
import { useMessage } from 'naive-ui'
import { getCachedUser, resetAuthState } from '@/router'
import IonIcon from './IonIcon.vue'

const message = useMessage()
const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()

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

  // 用当前显示顺序为基础
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
      // 首次出现时（localStorage 里没有记录）默认展开
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

  // 以当前渲染顺序为基础重排
  const allTableNames = [
    ...groupedTables.value.flatMap(g => g.tables.map(t => t.name)),
    ...ungroupedTables.value.map(t => t.name),
  ]
  // 去重，保持顺序（用 tableOrder 补全未排序的表）
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
.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid #e9e9e7;
  display: flex;
  align-items: center;
  gap: 8px;
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
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  margin: 4px 6px 0;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #787774;
  transition: background 0.12s, color 0.12s;
}
.nav-item:hover {
  background: rgba(55, 53, 47, 0.08);
  color: #37352f;
}
.nav-item.active {
  background: rgba(55, 53, 47, 0.1);
  color: #37352f;
}
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
.group-header:hover {
  color: #37352f;
}
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
.group-arrow.expanded {
  transform: rotate(90deg);
}
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
.table-item.grouped {
  padding-left: 28px;
}
.table-item:hover {
  background: rgba(55, 53, 47, 0.08);
}
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
.sidebar-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  border-top: 1px solid #e9e9e7;
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.12s;
  border-radius: 0;
}
.user-trigger:hover {
  background: rgba(55, 53, 47, 0.06);
}
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
}
.user-details {
  min-width: 0;
  flex: 1;
}
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
/* User menu */
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
