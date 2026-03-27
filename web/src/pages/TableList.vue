<template>
  <div class="dashboard">
    <div class="dashboard-inner">
      <!-- Header -->
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Tables</h1>
          <p class="dash-desc">Manage all your data tables</p>
        </div>
        <button class="new-table-btn" @click="showCreateTable = true">
          <span class="btn-icon">+</span>
          New Table
        </button>
      </div>

      <!-- Search + Tabs -->
      <div class="search-tabs-area">
        <div class="search-wrap">
          <span class="search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="Search tables..."
          />
          <div class="search-shortcuts" aria-hidden="true">
            <span class="search-shortcut-key search-shortcut-symbol">{{ shortcutModifierLabel }}</span>
            <span class="search-shortcut-key">K</span>
          </div>
        </div>

        <div class="tabs-bar">
          <button
            v-for="tab in tabs"
            :key="tab"
            class="tab-btn"
            :class="{ active: activeTab === tab }"
            @click="activeTab = tab"
          >
            <span v-if="tab === 'Recent'" class="tab-clock-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </span>
            {{ tab }}
            <span v-if="activeTab === tab" class="tab-indicator" />
          </button>
          <span class="tab-separator" aria-hidden="true" />
          <button class="tab-add-btn" @click="showNewGroup = true" title="New Group">+</button>
        </div>
      </div>

      <!-- Loading -->
      <n-spin v-if="isLoading" style="padding: 80px; display: flex; justify-content: center;" />

      <!-- Content -->
      <template v-else>
        <div class="sections">
          <div v-for="(items, groupName) in groupedData" :key="groupName" class="group-section">
            <div class="group-section-header">
              <div class="group-header-left">
                <HoverTooltipText
                  :text="groupName"
                  class-name="group-section-name"
                  as="h2"
                />
                <span class="group-section-count">{{ items.length }} tables</span>
              </div>
              <button
                v-if="activeTab === 'All' && getGroupByName(groupName)"
                class="group-settings-btn"
                @click="openEditGroup(getGroupByName(groupName)!)"
              >
                <span class="group-settings-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </span>
                Settings
              </button>
            </div>
            <div class="table-cards">
            <div
              v-for="t in items"
              :key="t.name"
              class="table-card"
              @click="onCardClick(t)"
              >
                <div class="card-left">
                  <div class="card-icon" @click.stop="openIconPicker(t)" title="Click to change icon">
                    <IonIcon v-if="t.icon && t.icon.startsWith('ion:')" :name="t.icon.slice(4)" :size="20" />
                    <span v-else-if="t.icon" class="card-icon-emoji">{{ t.icon }}</span>
                    <IonIcon v-else name="GridOutline" :size="20" />
                  </div>
                  <div class="card-info">
                    <HoverTooltipText
                      :text="t.title || t.name"
                      class-name="card-title"
                    />
                    <div class="card-meta">
                      <span class="card-id" @click.stop="copyTableId(t.name)">
                        ID: {{ t.name }}
                        <span class="card-copy-icon">
                          <template v-if="copiedId === t.name">✓</template>
                          <template v-else>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </template>
                        </span>
                      </span>
                      <span class="card-count">{{ t.row_count ?? 0 }} records</span>
                      <span v-if="activeTab === 'Recent' && recentAccess[t.name]" class="card-dot">•</span>
                      <span v-if="activeTab === 'Recent' && recentAccess[t.name]" class="card-last-access">
                        {{ formatDate(recentAccess[t.name]) }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="card-right">
                  <button
                    class="card-delete-btn"
                    type="button"
                    @click.stop="confirmDeleteTable(t)"
                    :aria-label="`Delete table ${t.title || t.name}`"
                    title="Delete table"
                  >
                    <IonIcon name="TrashOutline" :size="14" />
                  </button>
                  <span class="card-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="Object.keys(groupedData).length === 0 && !isLoading" class="empty-state">
          <div class="empty-icon-big">
            <IonIcon name="SearchOutline" :size="40" />
          </div>
          <p class="empty-text">No tables found matching your criteria.</p>
        </div>
      </template>

      <!-- Icon picker modal -->
      <AppModal v-model:show="showIconPicker" title="Change Icon" width="360px" height="auto">
        <icon-picker
          :current-icon="iconPickerTarget?.icon ?? null"
          @select="onIconSelect"
        />
      </AppModal>

      <CreateTableModal
        v-model:show="showCreateTable"
        @created="(name: string) => { queryClient.invalidateQueries({ queryKey: ['tables'] }); router.push(`/tables/${name}`) }"
      />

      <!-- New Group modal -->
      <AppModal v-model:show="showNewGroup" title="New Group" width="520px" height="min(620px, 70vh)">
        <div class="ng-form">
          <label class="ng-label">Group Name</label>
          <input v-model="newGroupName" class="ng-input" placeholder="e.g. Marketing, Engineering..." />
          <label class="ng-label" style="margin-top:16px;">Included Tables</label>
          <div class="ng-hint">{{ newGroupTables.size }} selected</div>
          <div class="ng-table-list">
            <label
              v-for="t in tables ?? []"
              :key="t.name"
              class="ng-table-item"
            >
              <input
                type="checkbox"
                :checked="newGroupTables.has(t.name)"
                @change="toggleNewGroupTable(t.name)"
                class="ng-checkbox"
              />
              <span class="ng-table-icon">
                <IonIcon v-if="t.icon && t.icon.startsWith('ion:')" :name="t.icon.slice(4)" :size="16" />
                <span v-else-if="t.icon">{{ t.icon }}</span>
                <IonIcon v-else name="GridOutline" :size="16" />
              </span>
              <HoverTooltipText
                :text="t.title || t.name"
                class-name="ng-table-name"
              />
            </label>
          </div>
          <div class="ng-footer">
            <button class="ng-btn" @click="showNewGroup = false">Cancel</button>
            <button class="ng-btn primary" :disabled="!newGroupName.trim()" @click="createGroup">Save</button>
          </div>
        </div>
      </AppModal>

      <AppModal v-model:show="showEditGroup" title="Edit Group" width="520px" height="min(660px, 70vh)">
        <div class="ng-form">
          <label class="ng-label">Group Name</label>
          <input v-model="editingGroupName" class="ng-input" placeholder="Enter group name" />
          <label class="ng-label" style="margin-top:16px;">Included Tables</label>
          <div class="ng-hint">{{ selectedGroupTables.size }} selected</div>
          <div class="ng-table-list edit-group-table-list">
            <div
              v-for="t in tables ?? []"
              :key="t.name"
              class="ng-table-item"
            >
              <label class="ng-table-main">
                <input
                  type="checkbox"
                  :checked="selectedGroupTables.has(t.name)"
                  @change="toggleSelectedGroupTable(t.name)"
                  class="ng-checkbox"
                />
                <span class="ng-table-icon">
                  <IonIcon v-if="t.icon && t.icon.startsWith('ion:')" :name="t.icon.slice(4)" :size="16" />
                  <span v-else-if="t.icon">{{ t.icon }}</span>
                  <IonIcon v-else name="GridOutline" :size="16" />
                </span>
                <HoverTooltipText
                  :text="t.title || t.name"
                  class-name="ng-table-name"
                />
              </label>
            </div>
          </div>
          <div class="ng-footer">
            <button class="ng-btn danger" :disabled="savingEditGroup || !editingGroupData" @click="handleDeleteGroup">
              Delete
            </button>
            <div class="ng-footer-spacer" />
            <button class="ng-btn" @click="showEditGroup = false">Cancel</button>
            <button class="ng-btn primary" :disabled="savingEditGroup || !editingGroupName.trim()" @click="saveEditedGroup">
              Save
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useDialog, useMessage } from 'naive-ui'
import { api, type TableMeta, type Group } from '@/api/client'
import CreateTableModal from '@/components/CreateTableModal.vue'
import AppModal from '@/components/AppModal.vue'
import HoverTooltipText from '@/components/HoverTooltipText.vue'
import IonIcon from '@/components/IonIcon.vue'

const IconPicker = defineAsyncComponent(() => import('@/components/IconPicker.vue'))

const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()
const dialog = useDialog()
const searchInputRef = ref<HTMLInputElement | null>(null)

// ── Data fetching ──
const { data: tables, isLoading } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

const { data: groups } = useQuery({
  queryKey: ['groups'],
  queryFn: api.getGroups,
  retry: false,
})

// ── State ──
const searchQuery = ref('')
const activeTab = ref('Recent')
const showCreateTable = ref(false)
const copiedId = ref<string | null>(null)
const showEditGroup = ref(false)
const editingGroupData = ref<Group | null>(null)
const editingGroupName = ref('')
const selectedGroupTables = ref(new Set<string>())
const savingEditGroup = ref(false)
const isMacLike = typeof navigator !== 'undefined' && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
const shortcutModifierLabel = isMacLike ? '⌘' : 'Ctrl'

// ── Recent access tracking via localStorage ──
const RECENT_KEY = 'd1table_recent_access'

function loadRecentAccess(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}')
  } catch {
    return {}
  }
}

const recentAccess = ref<Record<string, number>>(loadRecentAccess())
const recentTableNames = computed(() =>
  Object.entries(recentAccess.value)
    .sort(([, aTime], [, bTime]) => bTime - aTime)
    .slice(0, 20)
    .map(([name]) => name)
)

function trackAccess(tableName: string) {
  recentAccess.value[tableName] = Date.now()
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentAccess.value))
}

function formatDate(ts: number): string {
  const date = new Date(ts)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}/${month}/${day}`
}

// ── Sorting helpers (consistent with sidebar) ──
const tableOrder = ref<string[]>(
  JSON.parse(localStorage.getItem('d1table_table_order') ?? 'null') ?? []
)
const groupOrder = ref<number[]>(
  JSON.parse(localStorage.getItem('d1table_group_order') ?? 'null') ?? []
)

function sortedTables(list: TableMeta[]): TableMeta[] {
  if (!tableOrder.value.length) return list
  const idx = (name: string) => {
    const i = tableOrder.value.indexOf(name)
    return i === -1 ? 9999 : i
  }
  return [...list].sort((a, b) => idx(a.name) - idx(b.name))
}

function sortedGroupsList<T extends { id: number }>(list: T[]): T[] {
  if (!groupOrder.value.length) return list
  const idx = (id: number) => {
    const i = groupOrder.value.indexOf(id)
    return i === -1 ? 9999 : i
  }
  return [...list].sort((a, b) => idx(a.id) - idx(b.id))
}

// ── Tabs ──
const dynamicGroupNames = computed(() => {
  if (!groups.value || groups.value.length === 0) return []
  return sortedGroupsList(groups.value).map(g => g.name)
})

const tabs = computed(() => {
  return ['Recent', ...dynamicGroupNames.value, 'All']
})

function getGroupByName(name: string): Group | null {
  return groups.value?.find(group => group.name === name) ?? null
}

// ── Filtering ──
const filteredData = computed(() => {
  if (!tables.value) return []
  let filtered = [...tables.value]

  // Search filter
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      t => (t.title || '').toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    )
  }

  // Tab filter
  if (activeTab.value === 'Recent') {
    const visibleRecentNames = new Set(recentTableNames.value)
    filtered = filtered.filter(t => visibleRecentNames.has(t.name))
    filtered = [...filtered].sort((a, b) => {
      const aTime = recentAccess.value[a.name] || 0
      const bTime = recentAccess.value[b.name] || 0
      return bTime - aTime
    })
  } else if (activeTab.value !== 'All') {
    // Filter by group name
    const group = groups.value?.find(g => g.name === activeTab.value)
    if (group) {
      const groupTableNames = new Set(group.tables)
      filtered = filtered.filter(t => groupTableNames.has(t.name))
    }
  }

  return filtered
})

// ── Grouped display ──
const groupedData = computed<Record<string, TableMeta[]>>(() => {
  const data = filteredData.value
  if (!data.length) return {}

  if (activeTab.value === 'Recent') {
    return { 'Recently Accessed': data }
  }

  if (activeTab.value !== 'All') {
    // Single group tab - show as one section
    return { [activeTab.value]: data }
  }

  // "All" tab - group by group membership
  if (!groups.value || groups.value.length === 0) {
    return { 'All Tables': sortedTables(data) }
  }

  const result: Record<string, TableMeta[]> = {}
  const groupedNames = new Set<string>()

  for (const g of sortedGroupsList(groups.value)) {
    const groupTableNames = new Set(g.tables)
    const groupTables = sortedTables(data.filter(t => groupTableNames.has(t.name)))
    result[g.name] = groupTables
    groupTables.forEach(t => groupedNames.add(t.name))
  }

  const ungrouped = sortedTables(data.filter(t => !groupedNames.has(t.name)))
  if (ungrouped.length > 0) {
    result['Ungrouped'] = ungrouped
  }

  return result
})

// ── Actions ──
function onCardClick(t: TableMeta) {
  trackAccess(t.name)
  router.push(`/tables/${t.name}`)
}

function copyTableId(name: string) {
  navigator.clipboard.writeText(name)
  copiedId.value = name
  setTimeout(() => { copiedId.value = null }, 1500)
}

function focusSearchInput() {
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

function handleSearchShortcut(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'k') return
  if (!(event.metaKey || event.ctrlKey)) return
  if (isEditableTarget(event.target)) return
  event.preventDefault()
  focusSearchInput()
}

// ── Icon picker ──
const showIconPicker = ref(false)
const iconPickerTarget = ref<TableMeta | null>(null)

function openIconPicker(t: TableMeta) {
  iconPickerTarget.value = t
  showIconPicker.value = true
}

async function onIconSelect(icon: string | null) {
  if (!iconPickerTarget.value) return
  showIconPicker.value = false
  try {
    await api.updateTableIcon(iconPickerTarget.value.name, icon)
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
  iconPickerTarget.value = null
}

// ── New Group ──
const showNewGroup = ref(false)
const newGroupName = ref('')
const newGroupTables = ref(new Set<string>())

function toggleNewGroupTable(name: string) {
  const s = new Set(newGroupTables.value)
  if (s.has(name)) s.delete(name); else s.add(name)
  newGroupTables.value = s
}

function getTableGroup(tableName: string): string | null {
  if (!groups.value) return null
  for (const g of groups.value) {
    if (g.tables.includes(tableName)) return g.name
  }
  return null
}

async function createGroup() {
  if (!newGroupName.value.trim()) return
  try {
    const result = await api.createGroup(newGroupName.value.trim())
    if (newGroupTables.value.size > 0) {
      await api.setGroupTables(result.id, [...newGroupTables.value])
    }
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    showNewGroup.value = false
    newGroupName.value = ''
    newGroupTables.value = new Set()
    message.success('Group created')
  } catch (err) {
    message.error((err as Error).message)
  }
}

function openEditGroup(group: Group) {
  editingGroupData.value = group
  editingGroupName.value = group.name
  selectedGroupTables.value = new Set(group.tables)
  showEditGroup.value = true
}

function toggleSelectedGroupTable(name: string) {
  const next = new Set(selectedGroupTables.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selectedGroupTables.value = next
}

async function saveEditedGroup() {
  if (!editingGroupData.value || !editingGroupName.value.trim()) return
  savingEditGroup.value = true
  try {
    const nextName = editingGroupName.value.trim()
    if (nextName !== editingGroupData.value.name) {
      await api.updateGroup(editingGroupData.value.id, { name: nextName })
    }
    await api.setGroupTables(editingGroupData.value.id, [...selectedGroupTables.value])
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    if (activeTab.value === editingGroupData.value.name && nextName !== editingGroupData.value.name) {
      activeTab.value = nextName
    }
    message.success('Group updated')
    showEditGroup.value = false
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    savingEditGroup.value = false
  }
}

async function confirmDeleteTable(t: TableMeta) {
  dialog.warning({
    title: 'Delete Table',
    content: `Delete table ${t.title || t.name}? It will be moved to Trash.`,
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.deleteTable(t.name)
        queryClient.invalidateQueries({ queryKey: ['tables'] })
        queryClient.invalidateQueries({ queryKey: ['groups'] })
        message.success('Table moved to Trash')
      } catch (err) {
        message.error((err as Error).message)
      }
    },
  })
}

async function handleDeleteGroup() {
  if (!editingGroupData.value) return
  dialog.warning({
    title: 'Delete Group',
    content: 'Delete this group? Tables inside will not be deleted.',
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      savingEditGroup.value = true
      try {
        const deletedName = editingGroupData.value!.name
        await api.deleteGroup(editingGroupData.value!.id)
        queryClient.invalidateQueries({ queryKey: ['groups'] })
        queryClient.invalidateQueries({ queryKey: ['tables'] })
        if (activeTab.value === deletedName) {
          activeTab.value = 'All'
        }
        message.success('Group deleted')
        showEditGroup.value = false
      } catch (err) {
        message.error((err as Error).message)
      } finally {
        savingEditGroup.value = false
      }
    },
  })
}

watch(showNewGroup, (v) => {
  if (v) { newGroupName.value = ''; newGroupTables.value = new Set() }
})

watch(showEditGroup, (v) => {
  if (!v) {
    editingGroupData.value = null
    editingGroupName.value = ''
    selectedGroupTables.value = new Set()
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleSearchShortcut)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleSearchShortcut)
})
</script>

<style scoped>
.dashboard {
  height: 100%;
  overflow-y: auto;
  background: #fff;
  color: #37352f;
}

.dashboard-inner {
  max-width: 920px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

/* ── Header ── */
.dash-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}
@media (min-width: 640px) {
  .dash-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-end;
  }
}

.dash-title {
  font-size: 30px;
  font-weight: 700;
  color: #37352f;
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}

.dash-desc {
  font-size: 14px;
  color: #787774;
  margin: 0;
}

.new-table-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #37352f;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  white-space: nowrap;
  width: 100%;
}
@media (min-width: 640px) {
  .new-table-btn {
    width: auto;
  }
}
.new-table-btn:hover {
  background: #2f2d2a;
}
.btn-icon {
  font-size: 16px;
  font-weight: 400;
  line-height: 1;
}

/* ── Search + Tabs ── */
.search-tabs-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 40px;
}

.search-wrap {
  position: relative;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #787774;
  display: flex;
  align-items: center;
  pointer-events: none;
}
.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 84px 11px 36px;
  background: #fbfbfa;
  border: 1px solid #e7e5e4;
  border-radius: 8px;
  font-size: 14px;
  color: #37352f;
  outline: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.search-input::placeholder {
  color: #9b9a97;
}
.search-input:hover {
  background: #fff;
}
.search-input:focus {
  background: #fff;
  border-color: #ddd9d5;
  box-shadow: 0 0 0 3px rgba(55, 53, 47, 0.06);
}

.search-shortcuts {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #9b9a97;
}

.search-shortcut-key {
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-radius: 5px;
  border: 1px solid #e7e5e4;
  background: #f7f7f5;
  font-size: 11px;
  line-height: 1;
}

.search-shortcut-symbol {
  min-width: 18px;
}

/* ── Tabs ── */
.tabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid #e9e9e7;
  padding-bottom: 1px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tabs-bar::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 10px;
  font-size: 14px;
  font-weight: 450;
  color: #787774;
  background: none;
  border: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s;
}
.tab-btn:hover {
  background: #f1f1ef;
}
.tab-btn.active {
  color: #37352f;
  font-weight: 500;
}
.tab-btn.active:hover {
  background: transparent;
}

.tab-separator {
  width: 1px;
  height: 18px;
  background: #e9e9e7;
  margin: 0 4px;
  flex-shrink: 0;
}
.tab-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  color: #9b9a97;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.tab-add-btn:hover {
  background: #f1f1ef;
  color: #37352f;
}

.tab-clock-icon {
  display: flex;
  align-items: center;
}

.tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: #37352f;
  border-radius: 1px;
}

/* ── Sections ── */
.sections {
  display: flex;
  flex-direction: column;
  gap: 48px;
}

.group-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 12px;
}

.group-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-section-name {
  font-size: 16px;
  font-weight: 600;
  color: #37352f;
  margin: 0;
}

.group-section-count {
  font-size: 12px;
  color: #787774;
  background: #f1f1ef;
  padding: 3px 10px;
  border-radius: 12px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

.group-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid #e8e6e3;
  border-radius: 10px;
  background: #f7f7f5;
  color: #4b4944;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.group-settings-btn:hover {
  background: #f1f1ef;
  border-color: #ddd8d2;
  color: #37352f;
}

.group-settings-icon {
  display: inline-flex;
  align-items: center;
  color: #787774;
}

/* ── Card grid ── */
.table-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px 12px;
}
@media (min-width: 640px) {
  .table-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

.table-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e8e6e3;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s, box-shadow 0.15s, border-color 0.15s;
  box-shadow: 0 1px 2px rgba(15, 15, 15, 0.04);
  min-height: 88px;
}
.table-card:hover {
  background: #fff;
  border-color: #ddd8d2;
  box-shadow: 0 8px 20px rgba(15, 15, 15, 0.06);
  transform: translateY(-1px);
}

.card-left {
  display: flex;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  min-width: 0;
}

.card-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f7f7f5;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.card-icon:hover {
  background: #e9e9e7;
}

.card-icon-emoji {
  font-size: 20px;
  line-height: 1;
}


.card-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #37352f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.card-id {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f1f1ef;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  color: #787774;
  cursor: pointer;
  transition: background 0.12s;
}
.card-id:hover {
  background: #e9e9e7;
}

.card-copy-icon {
  display: inline-flex;
  align-items: center;
  color: #787774;
  transition: color 0.12s;
}
.card-id:hover .card-copy-icon {
  color: #37352f;
}

.card-count {
  font-size: 12px;
  color: #787774;
}

.card-dot {
  font-size: 12px;
  color: #9b9a97;
}

.card-last-access {
  font-size: 12px;
  color: #9b9a97;
}

.card-right {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #787774;
  flex-shrink: 0;
}

.card-delete-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #f0d4d1;
  border-radius: 7px;
  background: #fff;
  color: #d9485f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.table-card:hover .card-delete-btn,
.card-delete-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
.card-delete-btn:hover {
  background: #fff5f5;
  border-color: #d9485f;
}

.card-arrow {
  opacity: 0.45;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
}
.table-card:hover .card-arrow {
  opacity: 0.85;
}

/* ── Empty state ── */
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #787774;
}
.empty-icon-big {
  font-size: 40px;
  margin-bottom: 16px;
}
.empty-text {
  font-size: 15px;
  color: #787774;
  margin: 0;
}

/* ── New Group modal ── */
.ng-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.ng-label {
  font-size: 14px;
  font-weight: 500;
  color: #37352f;
  margin-bottom: 6px;
}
.ng-hint {
  font-size: 12px;
  color: #9b9a97;
  margin-bottom: 8px;
  text-align: right;
  margin-top: -20px;
}
.ng-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  color: #37352f;
}
.ng-input:focus { border-color: #2383e2; box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.2); }
.ng-table-list {
  flex: 1;
  min-height: 280px;
  max-height: min(360px, 100%);
  overflow-y: auto;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
}

.edit-group-table-list {
  min-height: 320px;
}
.ng-table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  transition: background 0.1s;
  font-size: 14px;
  color: #37352f;
}
.ng-table-item:hover { background: #f7f7f5; }
.ng-table-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.ng-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: #2383e2;
  cursor: pointer;
}
.ng-table-icon { font-size: 16px; flex-shrink: 0; }
.ng-table-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ng-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.ng-footer-spacer {
  flex: 1;
}

.ng-btn {
  padding: 8px 20px;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  color: #37352f;
  cursor: pointer;
  transition: all 0.15s;
}
.ng-btn:hover { background: #f7f7f5; }
.ng-btn.primary { background: #2383e2; color: #fff; border-color: #2383e2; }
.ng-btn.primary:hover { background: #1b6ec2; }
.ng-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.ng-btn.danger { color: #c4554d; border-color: #f0d4d1; background: #fff; }
.ng-btn.danger:hover { background: #fdf4f3; }
.ng-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
