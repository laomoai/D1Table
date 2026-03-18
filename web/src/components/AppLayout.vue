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
      style="background: #1a1d2e;"
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
        <div v-if="currentUser" class="user-info">
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
        </div>
        <div class="footer-actions">
          <n-button text size="small" style="color: #8892b0;" @click="router.push('/settings')">
            <template #icon><n-icon :component="SettingsIcon" /></template>
            Settings
          </n-button>
          <n-button text size="small" style="color: #8892b0;" @click="logout">
            Logout
          </n-button>
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
import { computed, ref, nextTick, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NLayout, NLayoutSider, NLayoutContent, NButton, NIcon } from 'naive-ui'
import { GridOutline as TableIcon, Settings as SettingsIcon } from '@vicons/ionicons5'
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

// ── Group collapse ──────────────────────────────────────────────────
const expandedGroups = reactive(new Set<number>([-1])) // -1 = ungrouped, expanded by default

function toggleGroup(id: number) {
  if (expandedGroups.has(id)) {
    expandedGroups.delete(id)
  } else {
    expandedGroups.add(id)
  }
}

// Compute grouped table list
const groupedTables = computed(() => {
  if (!groups.value || !tables.value || groups.value.length === 0) return []

  return groups.value
    .filter(g => g.tables.length > 0)
    .map(g => {
      // Auto-expand on first appearance
      if (!expandedGroups.has(g.id) && expandedGroups.size <= 1) {
        expandedGroups.add(g.id)
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

const currentUser = computed(() => getCachedUser())

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
  border-bottom: 1px solid #2d3154;
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  filter: invert(1);
  opacity: 0.9;
  flex-shrink: 0;
}
.logo {
  font-size: 18px;
  font-weight: 700;
  color: #ccd6f6;
  letter-spacing: 1px;
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
  color: #6b7394;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}
.group-header:hover {
  color: #8892b0;
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
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 5px;
  border-radius: 8px;
  color: #6b7394;
}
.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  cursor: pointer;
  color: #8892b0;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}
.table-item.grouped {
  padding-left: 32px;
}
.table-item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #ccd6f6;
}
.table-item.active {
  background: rgba(79, 110, 247, 0.2);
  color: #ffffff;
}
.table-icon { flex-shrink: 0; opacity: 0.7; }
.table-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-name-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(79, 110, 247, 0.6);
  border-radius: 3px;
  color: #fff;
  padding: 2px 6px;
  font-size: 13px;
  outline: none;
  min-width: 0;
}
.table-item[draggable="true"] { cursor: grab; }
.table-item[draggable="true"]:active { cursor: grabbing; }
.sidebar-footer {
  position: absolute;
  bottom: 16px;
  left: 16px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 4px;
}
.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
}
.user-details {
  min-width: 0;
  flex: 1;
}
.user-name {
  font-size: 12px;
  color: #ccd6f6;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-email {
  font-size: 11px;
  color: #6b7394;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px 16px;
}
</style>
