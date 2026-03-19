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

      <!-- Groups + table list -->
      <div class="table-list">
        <!-- Grouped tables -->
        <template v-for="group in groupedTables" :key="group.id">
          <div
            class="group-header"
            @click="toggleGroup(group.id)"
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
              <n-icon class="table-icon" :component="TableIcon" size="14" />
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
              <n-icon class="table-icon" :component="TableIcon" size="14" />
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
        <n-dropdown
          trigger="click"
          placement="top-start"
          :options="userMenuOptions"
          @select="handleUserMenuSelect"
        >
          <div v-if="currentUser" class="user-trigger">
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
        </n-dropdown>
      </div>
    </n-layout-sider>

    <!-- Main content area -->
    <n-layout-content>
      <router-view />
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, reactive, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NLayout, NLayoutSider, NLayoutContent, NButton, NIcon, NDropdown } from 'naive-ui'
import { GridOutline as TableIcon } from '@vicons/ionicons5'
import { api, http, type TableMeta } from '@/api/client'
import { useMessage } from 'naive-ui'
import { getCachedUser, resetAuthState } from '@/router'

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

function toggleGroup(id: number) {
  if (expandedGroups.has(id)) expandedGroups.delete(id)
  else expandedGroups.add(id)
  localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...expandedGroups]))
}

// Compute grouped table list
const groupedTables = computed(() => {
  if (!groups.value || !tables.value || groups.value.length === 0) return []

  return groups.value
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

const userMenuOptions = [
  { label: 'Settings', key: 'settings' },
  { type: 'divider', key: 'd1' },
  { label: 'Logout', key: 'logout' },
]

function handleUserMenuSelect(key: string) {
  if (key === 'settings') router.push('/settings')
  if (key === 'logout') logout()
}

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
</style>
