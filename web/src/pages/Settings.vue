<template>
  <div class="settings-page">
    <div class="settings-header">
      <h2 class="settings-title">Settings</h2>
    </div>

    <n-tabs type="line" animated>
      <!-- ─── Tab: API Keys ──────────────────────────────── -->
      <n-tab-pane name="keys" tab="API Keys">
        <div class="tab-content">
          <n-spin v-if="keysLoading" />
          <template v-else>
            <div v-if="keys?.length" class="key-list">
              <div v-for="k in keys" :key="k.id" class="key-card" :class="{ revoked: !k.is_active }">
                <div class="key-card-main">
                  <HoverTooltipText
                    :text="k.name"
                    class-name="key-card-name"
                    as="div"
                  />
                  <div class="key-card-meta">
                    <code class="key-prefix">{{ k.key_prefix }}...</code>
                    <n-tag :type="k.type === 'readonly' ? 'info' : 'warning'" size="tiny">
                      {{ k.type === 'readonly' ? 'Read-only' : 'Read-write' }}
                    </n-tag>
                    <n-tag v-if="k.scope === 'groups'" size="tiny" :bordered="false">
                      {{ k.groups?.map(g => g.name).join(', ') || 'No groups' }}
                    </n-tag>
                    <n-tag v-else size="tiny" :bordered="false">All tables</n-tag>
                    <n-tag v-if="k.notes_scope === 'roots'" size="tiny" :bordered="false">
                      {{ k.note_roots?.map(n => n.title).join(', ') || 'Selected note roots' }}
                    </n-tag>
                    <n-tag v-else-if="k.notes_scope === 'all'" size="tiny" :bordered="false">All notes</n-tag>
                    <n-tag v-else size="tiny" :bordered="false">No notes</n-tag>
                    <n-tag v-if="!k.is_active" type="error" size="tiny">Revoked</n-tag>
                    <span class="key-last-used">{{ k.last_used_at ? 'Last used ' + formatRelativeTime(k.last_used_at) : 'Never used' }}</span>
                  </div>
                </div>
                <n-button
                  v-if="k.is_active"
                  size="tiny"
                  type="error"
                  quaternary
                  @click="handleRevoke(k.id)"
                >
                  Revoke
                </n-button>
              </div>
            </div>
            <div v-else class="empty-hint">No API Keys yet</div>

            <n-button type="primary" size="small" style="margin-top: 16px;" @click="showCreate = true">
              Create New Key
            </n-button>
          </template>

          <!-- Export Schema -->
          <div class="section" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #f0f0f0;">
            <div class="section-label">Schema Export</div>
            <div style="margin-top: 8px;">
              <n-button size="small" @click="showExportSchema = true">Export Schema CSV</n-button>
            </div>
            <div class="hint" style="margin-top: 8px;">Download table and field name mappings as a CSV file</div>
          </div>

          <!-- API Docs link -->
          <div class="section" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #f0f0f0;">
            <div class="section-label">API Documentation</div>
            <div style="display: flex; gap: 10px; margin-top: 8px;">
              <n-button tag="a" href="/api/docs" target="_blank" size="small" type="primary" ghost>
                View API Docs
              </n-button>
              <n-button tag="a" href="/api/openapi.json" target="_blank" size="small" quaternary>
                OpenAPI JSON
              </n-button>
            </div>
            <div class="hint" style="margin-top: 8px;">AI Agents can read this doc to auto-discover available endpoints</div>
          </div>
        </div>
      </n-tab-pane>

      <!-- ─── Tab 4: Trash ──────────────────────────────── -->
      <n-tab-pane name="trash" tab="Trash">
        <div class="tab-content">
          <div class="hint" style="margin-bottom: 16px;">
            Deleted items are kept in the trash for 30 days, then permanently deleted automatically
          </div>

          <!-- Category toggle -->
          <div class="trash-category-toggle">
            <button class="trash-cat-btn" :class="{ active: trashCategory === 'tables' }" @click="trashCategory = 'tables'">Tables</button>
            <button class="trash-cat-btn" :class="{ active: trashCategory === 'notes' }" @click="trashCategory = 'notes'">Notes</button>
          </div>

          <!-- Tables trash -->
          <template v-if="trashCategory === 'tables'">
            <n-spin v-if="trashLoading" />
            <template v-else>
              <div v-if="trashItems?.length" class="trash-panel">
                <div class="trash-list-shell">
                  <div class="trash-list">
                    <div v-for="item in trashItems" :key="item.id" class="trash-card">
                      <div class="trash-card-main">
                        <div class="trash-card-header">
                          <HoverTooltipText
                            :text="getTrashItemTitle(item)"
                            class-name="trash-card-table"
                          />
                          <code class="trash-card-id">{{ getTrashItemBadge(item) }}</code>
                        </div>
                        <div class="trash-card-preview">
                          {{ formatTrashPreview(item.record_data) }}
                        </div>
                        <div class="trash-card-meta">
                          Deleted at {{ formatTrashTime(item.deleted_at) }}
                        </div>
                      </div>
                      <div class="trash-card-actions">
                        <n-button size="tiny" type="primary" quaternary @click="handleRestore(item.id)">Restore</n-button>
                        <n-button size="tiny" type="error" quaternary @click="handlePermanentDelete(item.id)">Delete permanently</n-button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="trash-panel-footer">
                  <div v-if="trashTotal > trashPageSize" class="trash-pagination-wrap">
                    <n-pagination
                      v-model:page="trashPage"
                      v-model:page-size="trashPageSize"
                      :item-count="trashTotal"
                      :page-sizes="[20, 50, 100]"
                      show-size-picker
                      size="small"
                    />
                  </div>
                  <n-button
                    type="error"
                    size="small"
                    quaternary
                    @click="handleEmptyTrash"
                  >
                    Empty Trash
                  </n-button>
                </div>
              </div>
              <div v-else class="empty-hint">Trash is empty</div>
            </template>
          </template>

          <!-- Notes trash -->
          <template v-else>
            <n-spin v-if="notesTrashLoading" />
            <template v-else>
              <div v-if="notesTrashItems?.length" class="trash-panel">
                <div class="trash-list-shell">
                  <div class="trash-list">
                    <div v-for="item in notesTrashItems" :key="item.id" class="trash-card">
                      <div class="trash-card-main">
                        <div class="trash-card-header">
                          <span class="trash-note-icon">
                            <IonIcon v-if="item.icon && item.icon.startsWith('ion:')" :name="item.icon.slice(4)" :size="14" />
                            <span v-else-if="item.icon" class="note-emoji-icon">{{ item.icon }}</span>
                            <IonIcon v-else name="DocumentOutline" :size="14" />
                          </span>
                          <HoverTooltipText
                            :text="item.title || 'Untitled'"
                            class-name="trash-card-table"
                          />
                        </div>
                        <div class="trash-card-meta">Deleted at {{ formatNoteTrashTime(item.deleted_at) }}</div>
                      </div>
                      <div class="trash-card-actions">
                        <n-button size="tiny" type="primary" quaternary @click="handleNoteRestore(item.id)">Restore</n-button>
                        <n-button size="tiny" type="error" quaternary @click="handleNotePermDelete(item.id)">Delete permanently</n-button>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="notesTrashTotal > notesTrashPageSize" class="trash-panel-footer">
                  <div class="trash-pagination-wrap">
                    <n-pagination
                      v-model:page="notesTrashPage"
                      v-model:page-size="notesTrashPageSize"
                      :item-count="notesTrashTotal"
                      :page-sizes="[20, 50, 100]"
                      show-size-picker
                      size="small"
                    />
                  </div>
                </div>
              </div>
              <div v-else class="empty-hint">Trash is empty</div>
            </template>
          </template>
        </div>
      </n-tab-pane>

      <!-- ─── Tab: Users (admin only) ──────────────────────────── -->
      <n-tab-pane v-if="currentUserRole === 'admin'" name="users" tab="Users">
        <div class="tab-content">
          <div class="hint" style="margin-bottom: 16px;">
            Manage who can access this application. Only admins can manage users.
          </div>

          <!-- Add user form -->
          <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            <n-input v-model:value="newUserEmail" size="small" placeholder="Email address" style="width: 260px;" @keyup.enter="handleAddUser" />
            <n-radio-group v-model:value="newUserRole" size="small">
              <n-radio value="user">User</n-radio>
              <n-radio value="admin">Admin</n-radio>
            </n-radio-group>
            <n-button size="small" type="primary" :loading="addingUser" @click="handleAddUser">Add</n-button>
          </div>

          <n-spin :show="usersLoading">
            <div v-if="userList?.length" class="user-list">
              <div v-for="u in userList" :key="u.id" class="user-row">
                <img v-if="u.picture" :src="u.picture" class="user-avatar" referrerpolicy="no-referrer" />
                <div v-else class="user-avatar-placeholder">{{ (u.name || u.email)[0] }}</div>
                <div class="user-info">
                  <div class="user-name">{{ u.name || u.email }}</div>
                  <div class="user-email">{{ u.email }}</div>
                </div>
                <n-tag :type="u.role === 'admin' ? 'warning' : 'info'" size="small">{{ u.role }}</n-tag>
                <n-tag :type="u.status === 'active' ? 'success' : 'error'" size="small">{{ u.status }}</n-tag>
                <n-tag v-if="u.team_name" size="small" :bordered="false">{{ u.team_name }}</n-tag>
                <div class="user-actions">
                  <n-button
                    v-if="u.status === 'active' && u.id !== currentUserId"
                    size="tiny"
                    quaternary
                    @click="handleToggleUser(u.id, 'disabled')"
                  >Disable</n-button>
                  <n-button
                    v-if="u.status === 'disabled'"
                    size="tiny"
                    type="primary"
                    quaternary
                    @click="handleToggleUser(u.id, 'active')"
                  >Enable</n-button>
                  <n-button
                    v-if="u.id !== currentUserId"
                    size="tiny"
                    quaternary
                    @click="handleToggleRole(u)"
                  >{{ u.role === 'admin' ? 'Set User' : 'Set Admin' }}</n-button>
                </div>
              </div>
            </div>
            <div v-else class="empty-hint">No users yet</div>
          </n-spin>
        </div>
      </n-tab-pane>

      <!-- ─── Tab: Team ──────────────────────────────────────── -->
      <n-tab-pane name="team" tab="Team">
        <div class="tab-content">
          <div class="hint" style="margin-bottom: 16px;">
            Team members share the same tables, groups, notes and trash.
          </div>

          <n-spin :show="teamLoading">
            <template v-if="teamData">
              <!-- Team name -->
              <div class="section" style="margin-bottom: 20px;">
                <div class="section-title" style="font-size: 13px; font-weight: 600; color: #555; margin-bottom: 8px;">Team Name</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <n-input
                    v-model:value="editTeamName"
                    size="small"
                    style="width: 260px;"
                    @keyup.enter="handleRenameTeam"
                  />
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="editTeamName.trim() === teamData.name"
                    :loading="renamingTeam"
                    @click="handleRenameTeam"
                  >Rename</n-button>
                </div>
              </div>

              <!-- Add member -->
              <div class="section" style="margin-bottom: 20px;">
                <div class="section-title" style="font-size: 13px; font-weight: 600; color: #555; margin-bottom: 8px;">Add Member</div>
                <div style="display: flex; gap: 8px;">
                  <n-input v-model:value="newMemberEmail" size="small" placeholder="Email address" style="width: 260px;" @keyup.enter="handleAddMember" />
                  <n-button size="small" type="primary" :loading="addingMember" @click="handleAddMember">Add</n-button>
                </div>
              </div>

              <!-- Members list -->
              <div class="section">
                <div class="section-title" style="font-size: 13px; font-weight: 600; color: #555; margin-bottom: 8px;">Members ({{ teamData.members.length }})</div>
                <div class="user-list">
                  <div v-for="m in teamData.members" :key="m.id" class="user-row">
                    <img v-if="m.picture" :src="m.picture" class="user-avatar" referrerpolicy="no-referrer" />
                    <div v-else class="user-avatar-placeholder">{{ (m.name || m.email)[0] }}</div>
                    <div class="user-info">
                      <div class="user-name">{{ m.name || m.email }}</div>
                      <div class="user-email">{{ m.email }}</div>
                    </div>
                    <n-tag v-if="m.id === teamData.created_by" size="small" type="warning">Owner</n-tag>
                    <div class="user-actions">
                      <n-button
                        v-if="m.id !== currentUserId"
                        size="tiny"
                        quaternary
                        type="error"
                        :loading="removingMember === m.id"
                        @click="handleRemoveMember(m.id, m.name || m.email)"
                      >Remove</n-button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="empty-hint">No team info available</div>
          </n-spin>
        </div>
      </n-tab-pane>

      <!-- ─── Tab: Appearance ──────────────────────────────────── -->
      <n-tab-pane name="appearance" tab="Appearance">
        <div class="tab-content">
          <div class="section">
            <div class="section-title">Sidebar</div>

            <div class="appearance-row">
              <label class="appearance-label">Sidebar font size</label>
              <div class="appearance-control">
                <n-slider
                  v-model:value="sidebarFontSize"
                  :min="12"
                  :max="16"
                  :step="1"
                  :marks="{ 12: '12', 13: '13', 14: '14', 15: '15', 16: '16' }"
                  style="width: 180px;"
                  @update:value="saveSidebarPrefs"
                />
                <span class="appearance-value">{{ sidebarFontSize }}px</span>
              </div>
            </div>

            <div class="appearance-row" style="margin-top: 20px;">
              <label class="appearance-label">Sidebar text color</label>
              <div class="appearance-control">
                <input
                  type="color"
                  v-model="sidebarTextColor"
                  class="color-picker"
                  @change="saveSidebarPrefs"
                />
                <span class="appearance-value">{{ sidebarTextColor }}</span>
              </div>
            </div>

            <div style="margin-top: 20px;">
              <n-button size="small" @click="resetSidebarPrefs">Reset to defaults</n-button>
            </div>
          </div>
        </div>
      </n-tab-pane>

    </n-tabs>
  </div>

  <!-- Create Key modal -->
  <n-modal v-model:show="showCreate" preset="card" style="width: 480px;" title="Create API Key">
    <n-form :model="newKey" label-placement="left" label-width="80">
      <n-form-item label="Name" :rule="{ required: true, message: 'Please enter a name' }">
        <n-input v-model:value="newKey.name" placeholder="e.g. AI Agent Read-only Key" />
      </n-form-item>
      <n-form-item label="Permission">
        <n-radio-group v-model:value="newKey.type">
          <n-space>
            <n-radio value="readonly">Read-only</n-radio>
            <n-radio value="readwrite">Read-write</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <n-form-item label="Scope">
        <n-radio-group v-model:value="newKey.scope">
          <n-space>
            <n-radio value="all">All tables</n-radio>
            <n-radio value="groups">Selected groups</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <n-form-item v-if="newKey.scope === 'groups'" label="Select Groups">
        <template v-if="groupList?.length">
          <n-checkbox-group v-model:value="newKey.group_ids">
            <n-space>
              <n-checkbox v-for="g in groupList" :key="g.id" :value="g.id" :label="g.name" />
            </n-space>
          </n-checkbox-group>
        </template>
        <span v-else class="hint">No groups yet — please create one from the dashboard first</span>
      </n-form-item>
      <n-form-item label="Notes Access">
        <n-radio-group v-model:value="newKey.notes_scope">
          <n-space>
            <n-radio value="none">No notes</n-radio>
            <n-radio value="all">All notes</n-radio>
            <n-radio value="roots">Selected directories</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <n-form-item v-if="newKey.notes_scope === 'roots'" label="Select Directories">
        <template v-if="noteTree?.length">
          <n-checkbox-group v-model:value="newKey.note_root_ids">
            <div class="note-root-list">
              <label
                v-for="note in noteRootOptions"
                :key="note.id"
                class="note-root-item"
                :style="{ paddingLeft: `${note.depth * 18}px` }"
              >
                <n-checkbox :value="note.id" />
                <span class="note-root-icon">
                  <IonIcon v-if="note.icon && note.icon.startsWith('ion:')" :name="note.icon.slice(4)" :size="14" />
                  <span v-else-if="note.icon" class="note-emoji-icon">{{ note.icon }}</span>
                  <IonIcon v-else :name="note.hasChildren ? 'FolderOutline' : 'DocumentOutline'" :size="14" />
                </span>
                <span class="note-root-name">{{ note.title || 'Untitled' }}</span>
              </label>
            </div>
          </n-checkbox-group>
        </template>
        <span v-else class="hint">No notes yet</span>
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="showCreate = false">Cancel</n-button>
        <n-button type="primary" :loading="creating" @click="handleCreateKey">Create</n-button>
      </div>
    </template>
  </n-modal>

  <!-- New Key display modal -->
  <n-modal v-model:show="showNewKey" preset="card" style="width: 480px;" title="Save your API Key">
    <n-alert type="warning" style="margin-bottom: 12px;">
      This key is shown only once — you won't be able to view it again after closing!
    </n-alert>
    <n-input :value="newKeyValue" readonly type="text" />
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="copyKey">Copy</n-button>
        <n-button type="primary" @click="showNewKey = false">I've saved it</n-button>
      </div>
    </template>
  </n-modal>

  <!-- Export Schema modal -->
  <ExportSchemaModal
    v-model:show="showExportSchema"
    :tables="allTables ?? []"
    :groups="groupList ?? []"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import {
  NTabs, NTabPane, NForm, NFormItem, NInput, NButton, NText, NTag, NSpace,
  NSpin, NModal, NAlert, NRadioGroup, NRadio, NCheckboxGroup, NCheckbox,
  NSlider, NPagination, useMessage, useDialog,
} from 'naive-ui'
import { api, notesApi, userApi, teamApi, getCurrentUser, type ApiKeyInfo, type TableMeta, type TrashItem, type UserInfo, type TeamDetail, type NoteListItem } from '@/api/client'
import ExportSchemaModal from '@/components/ExportSchemaModal.vue'
import HoverTooltipText from '@/components/HoverTooltipText.vue'
import IonIcon from '@/components/IonIcon.vue'

const message = useMessage()
const dialog = useDialog()
const queryClient = useQueryClient()
const router = useRouter()

// ── Current User ─────────────────────────────────────────────
const currentUserId = ref<number>()
const currentUserRole = ref<'admin' | 'user'>('user')

getCurrentUser().then(u => {
  currentUserId.value = u.id
  currentUserRole.value = u.role
}).catch(() => {})

const showCreate = ref(false)
const showExportSchema = ref(false)
const showNewKey = ref(false)
const newKeyValue = ref('')
const creating = ref(false)
const newKey = ref({
  name: '',
  type: 'readonly' as 'readonly' | 'readwrite',
  scope: 'all' as 'all' | 'groups',
  group_ids: [] as number[],
  notes_scope: 'none' as 'all' | 'none' | 'roots',
  note_root_ids: [] as string[],
})

// ── API Keys ──────────────────────────────────────────────────
const { data: keys, isLoading: keysLoading } = useQuery({
  queryKey: ['admin-keys'],
  queryFn: api.getKeys,
  retry: false,
})

async function handleCreateKey() {
  if (!newKey.value.name.trim()) {
    message.warning('Please enter a name')
    return
  }
  creating.value = true
  try {
    const res = await api.createKey({
      name: newKey.value.name,
      type: newKey.value.type,
      scope: newKey.value.scope,
      group_ids: newKey.value.scope === 'groups' ? newKey.value.group_ids : undefined,
      notes_scope: newKey.value.notes_scope,
      note_root_ids: newKey.value.notes_scope === 'roots' ? newKey.value.note_root_ids : undefined,
    })
    newKeyValue.value = res.data.key
    showCreate.value = false
    showNewKey.value = true
    newKey.value = { name: '', type: 'readonly', scope: 'all', group_ids: [], notes_scope: 'none', note_root_ids: [] }
    queryClient.invalidateQueries({ queryKey: ['admin-keys'] })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    creating.value = false
  }
}

function formatRelativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function handleRevoke(id: number) {
  try {
    await api.revokeKey(id)
    message.success('Key revoked')
    queryClient.invalidateQueries({ queryKey: ['admin-keys'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

function copyKey() {
  navigator.clipboard.writeText(newKeyValue.value)
  message.success('Copied to clipboard')
}

const { data: groupList, isLoading: groupsLoading } = useQuery({
  queryKey: ['groups'],
  queryFn: api.getGroups,
  retry: false,
})

const { data: noteTree } = useQuery({
  queryKey: ['notes', 'tree', 'settings'],
  queryFn: notesApi.getTree,
  retry: false,
})

type NoteRootOption = NoteListItem & { depth: number; hasChildren: boolean }

const noteRootOptions = computed<NoteRootOption[]>(() => {
  const items = noteTree.value ?? []
  const childrenMap = new Map<string, NoteListItem[]>()
  for (const note of items) {
    if (!note.parent_id) continue
    const arr = childrenMap.get(note.parent_id) ?? []
    arr.push(note)
    childrenMap.set(note.parent_id, arr)
  }

  const roots = items.filter((note) => !note.parent_id)
  const out: NoteRootOption[] = []
  const walk = (note: NoteListItem, depth: number) => {
    const children = childrenMap.get(note.id) ?? []
    out.push({ ...note, depth, hasChildren: children.length > 0 })
    for (const child of children) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  return out
})

watch(() => newKey.value.scope, (scope) => {
  if (scope === 'groups' && newKey.value.notes_scope === 'all') {
    newKey.value.notes_scope = 'none'
  }
})

const { data: allTables } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

function getTableTitle(name: string): string {
  const t = allTables.value?.find(t => t.name === name)
  return t?.title || name
}

function isDeletedTableSnapshot(data: Record<string, unknown>): data is Record<string, unknown> & {
  __kind: 'table'
  meta?: { title?: string | null }
  field_meta?: unknown[]
  rows?: unknown[]
} {
  return data.__kind === 'table'
}

// ── Trash ──────────────────────────────────────────────────
const trashCategory = ref<'tables' | 'notes'>('tables')
const trashPage = ref(1)
const trashPageSize = ref(20)

const { data: trashResult, isLoading: trashLoading } = useQuery({
  queryKey: computed(() => ['trash', trashPage.value, trashPageSize.value]),
  queryFn: () => api.getTrash({ page: trashPage.value, page_size: trashPageSize.value }),
  retry: false,
})

const trashItems = computed(() => trashResult.value?.data)
const trashTotal = computed(() => trashResult.value?.meta.total ?? 0)

function formatTrashPreview(data: Record<string, unknown>): string {
  if (isDeletedTableSnapshot(data)) {
    const fieldCount = Array.isArray(data.field_meta) ? data.field_meta.length : 0
    const rowCount = Array.isArray(data.rows) ? data.rows.length : 0
    return `${fieldCount} fields / ${rowCount} records`
  }
  const entries = Object.entries(data).filter(([k]) => k !== 'id' && k !== 'created_at')
  return entries.slice(0, 3).map(([, v]) => v == null ? '—' : String(v)).join(' / ')
}

function getTrashItemTitle(item: TrashItem): string {
  if (isDeletedTableSnapshot(item.record_data)) {
    return (item.record_data.meta?.title as string | null | undefined) || item.table_name
  }
  return getTableTitle(item.table_name)
}

function getTrashItemBadge(item: TrashItem): string {
  if (isDeletedTableSnapshot(item.record_data)) {
    return `Table: ${item.table_name}`
  }
  return `ID: ${item.record_id}`
}

function formatTrashTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function handleRestore(id: number) {
  try {
    const item = trashItems.value?.find(entry => entry.id === id)
    await api.restoreTrash(id)
    message.success(item && isDeletedTableSnapshot(item.record_data) ? 'Table restored' : 'Record restored')
    queryClient.invalidateQueries({ queryKey: ['trash'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['records'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handlePermanentDelete(id: number) {
  dialog.warning({
    title: 'Delete Permanently',
    content: 'This item will be permanently deleted and cannot be recovered.',
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.deleteTrash(id)
        message.success('Permanently deleted')
        queryClient.invalidateQueries({ queryKey: ['trash'], exact: false })
      } catch (err) {
        message.error((err as Error).message)
      }
    },
  })
}

// ── Notes Trash ──────────────────────────────────────────
const notesTrashPage = ref(1)
const notesTrashPageSize = ref(20)

const { data: notesTrashResult, isLoading: notesTrashLoading } = useQuery({
  queryKey: computed(() => ['notes-trash', notesTrashPage.value, notesTrashPageSize.value]),
  queryFn: () => notesApi.getTrash({ page: notesTrashPage.value, page_size: notesTrashPageSize.value }),
  retry: false,
})

const notesTrashItems = computed(() => notesTrashResult.value?.data)
const notesTrashTotal = computed(() => notesTrashResult.value?.meta.total ?? 0)

function formatNoteTrashTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function handleNoteRestore(id: string) {
  try {
    await notesApi.restoreNote(id)
    message.success('Note restored')
    queryClient.invalidateQueries({ queryKey: ['notes-trash'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handleNotePermDelete(id: string) {
  dialog.warning({
    title: 'Delete Permanently',
    content: 'This note will be permanently deleted and cannot be recovered.',
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await notesApi.permanentDeleteNote(id)
        message.success('Permanently deleted')
        queryClient.invalidateQueries({ queryKey: ['notes-trash'], exact: false })
      } catch (err) {
        message.error((err as Error).message)
      }
    },
  })
}

async function handleEmptyTrash() {
  dialog.warning({
    title: 'Empty Trash',
    content: 'All items in the trash will be permanently deleted and cannot be recovered.',
    positiveText: 'Delete All',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await api.emptyTrash()
        message.success('Trash emptied')
        queryClient.invalidateQueries({ queryKey: ['trash'], exact: false })
      } catch (err) {
        message.error((err as Error).message)
      }
    },
  })
}

// ── Sidebar Appearance ────────────────────────────────────
const SIDEBAR_PREFS_KEY = 'd1table_sidebar_prefs'

function loadSidebarPrefs() {
  try {
    const raw = localStorage.getItem(SIDEBAR_PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const prefs = loadSidebarPrefs()
const sidebarFontSize = ref<number>(prefs.fontSize ?? 14)
const sidebarTextColor = ref<string>(prefs.textColor ?? '#37352f')

function saveSidebarPrefs() {
  localStorage.setItem(SIDEBAR_PREFS_KEY, JSON.stringify({
    fontSize: sidebarFontSize.value,
    textColor: sidebarTextColor.value,
  }))
  // 通知 AppLayout 更新（用 storage event）
  window.dispatchEvent(new StorageEvent('storage', {
    key: SIDEBAR_PREFS_KEY,
    newValue: localStorage.getItem(SIDEBAR_PREFS_KEY),
  }))
}

function resetSidebarPrefs() {
  sidebarFontSize.value = 14
  sidebarTextColor.value = '#37352f'
  saveSidebarPrefs()
}

// ── Team Management ──────────────────────────────────────────
const newMemberEmail = ref('')
const addingMember = ref(false)
const renamingTeam = ref(false)
const removingMember = ref<number | null>(null)
const editTeamName = ref('')

const { data: teamData, isLoading: teamLoading } = useQuery({
  queryKey: ['team-current'],
  queryFn: async () => {
    const data = await teamApi.getTeamInfo()
    editTeamName.value = data.name
    return data
  },
  retry: false,
})

async function handleRenameTeam() {
  const name = editTeamName.value.trim()
  if (!name) return
  renamingTeam.value = true
  try {
    await teamApi.renameTeam(name)
    message.success('Team renamed')
    queryClient.invalidateQueries({ queryKey: ['team-current'] })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    renamingTeam.value = false
  }
}

async function handleAddMember() {
  const email = newMemberEmail.value.trim()
  if (!email) {
    message.warning('Please enter an email')
    return
  }
  addingMember.value = true
  try {
    await teamApi.addMember(email)
    message.success(`Member "${email}" added`)
    newMemberEmail.value = ''
    queryClient.invalidateQueries({ queryKey: ['team-current'] })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    addingMember.value = false
  }
}

async function handleRemoveMember(userId: number, name: string) {
  dialog.warning({
    title: 'Remove Member',
    content: `Remove "${name}" from the team?`,
    positiveText: 'Remove',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      removingMember.value = userId
      try {
        await teamApi.removeMember(userId)
        message.success('Member removed')
        queryClient.invalidateQueries({ queryKey: ['team-current'] })
      } catch (err) {
        message.error((err as Error).message)
      } finally {
        removingMember.value = null
      }
    },
  })
}

// ── User Management ──────────────────────────────────────────
const newUserEmail = ref('')
const newUserRole = ref<'admin' | 'user'>('user')
const addingUser = ref(false)

const { data: userList, isLoading: usersLoading } = useQuery({
  queryKey: ['admin-users'],
  queryFn: userApi.getUsers,
  retry: false,
  enabled: () => currentUserRole.value === 'admin',
})

async function handleAddUser() {
  const email = newUserEmail.value.trim()
  if (!email) {
    message.warning('Please enter an email')
    return
  }
  addingUser.value = true
  try {
    await userApi.addUser({ email, role: newUserRole.value })
    message.success(`User "${email}" added`)
    newUserEmail.value = ''
    newUserRole.value = 'user'
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    addingUser.value = false
  }
}

async function handleToggleUser(id: number, status: 'active' | 'disabled') {
  try {
    await userApi.updateUser(id, { status })
    message.success(status === 'disabled' ? 'User disabled' : 'User enabled')
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handleToggleRole(u: UserInfo) {
  const newRole = u.role === 'admin' ? 'user' : 'admin'
  try {
    await userApi.updateUser(u.id, { role: newRole })
    message.success(`Role updated to ${newRole}`)
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}
</script>

<style scoped>
.settings-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px;
}
.settings-header {
  margin-bottom: 24px;
}
.settings-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a1d2e;
  margin: 0;
}
.tab-content {
  padding: 20px 0;
}
.section {
  margin-bottom: 24px;
}
.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 8px;
}
.hint {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}
.empty-hint {
  font-size: 13px;
  color: #bbb;
  padding: 24px 0;
  text-align: center;
}
.key-display {
  display: flex;
  align-items: center;
  gap: 10px;
}
.key-masked {
  font-size: 13px;
  color: #666;
  background: #f5f6f8;
  padding: 4px 10px;
  border-radius: 4px;
}

/* ── Group cards ── */
.group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.group-card {
  border: 1px solid #e8eaf0;
  border-radius: 8px;
  padding: 14px 16px;
  background: #fafbfc;
}
.group-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.group-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1d2e;
  cursor: pointer;
  flex: 1;
}
.group-card-name:hover {
  color: #4F6EF7;
}
.group-card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.group-card:hover .group-card-actions {
  opacity: 1;
}
.group-card-tables {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 24px;
}
.create-group-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ── Trash ── */
/* ── Trash category toggle ── */
.trash-category-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border: 1px solid #e0e3ec;
  border-radius: 8px;
  overflow: hidden;
  width: fit-content;
}
.trash-cat-btn {
  padding: 5px 18px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #666;
  transition: background 0.15s, color 0.15s;
}
.trash-cat-btn + .trash-cat-btn {
  border-left: 1px solid #e0e3ec;
}
.trash-cat-btn.active {
  background: #4f6ef7;
  color: #fff;
}
.trash-cat-btn:not(.active):hover {
  background: #f5f6fb;
  color: #333;
}
.trash-note-icon {
  font-size: 15px;
  flex-shrink: 0;
}
.note-emoji-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.trash-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.trash-list-shell {
  max-height: min(56vh, 720px);
  overflow: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}
.trash-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trash-panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.trash-pagination-wrap {
  display: flex;
  justify-content: center;
}
.trash-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e8eaf0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fff;
}
.trash-card-main {
  flex: 1;
  min-width: 0;
}
.trash-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.trash-card-table {
  font-size: 13px;
  font-weight: 500;
  color: #1a1d2e;
}
.trash-card-id {
  font-size: 11px;
  color: #999;
  background: #f5f6f8;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}
.trash-card-preview {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}
.trash-card-meta {
  font-size: 11px;
  color: #bbb;
  margin-top: 2px;
}
.trash-card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* ── Key list ── */
.key-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.key-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e8eaf0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fff;
}
.key-card.revoked {
  opacity: 0.5;
  background: #fafafa;
}
.key-card-main {
  flex: 1;
  min-width: 0;
}
.key-card-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1d2e;
  margin-bottom: 4px;
}
.key-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.key-prefix {
  font-size: 11px;
  color: #999;
  background: #f5f6f8;
  padding: 1px 6px;
  border-radius: 3px;
}
.key-last-used {
  font-size: 11px;
  color: #a3a19d;
}

.note-root-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
  width: 100%;
  padding: 6px 0;
}
.note-root-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  font-size: 13px;
  color: #37352f;
}
.note-root-icon {
  flex-shrink: 0;
}
.note-root-name {
  min-width: 0;
}

/* ── Appearance ── */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1d2e;
  margin-bottom: 16px;
}
.appearance-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}
.appearance-label {
  font-size: 13px;
  color: #555;
  width: 140px;
  flex-shrink: 0;
}
.appearance-control {
  display: flex;
  align-items: center;
  gap: 12px;
}
.appearance-value {
  font-size: 12px;
  color: #999;
  min-width: 40px;
}
.color-picker {
  width: 36px;
  height: 28px;
  border: 1px solid #e0e2ea;
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
  background: none;
}

/* User management */
.user-list { display: flex; flex-direction: column; gap: 4px; }
.user-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background 0.12s;
}
.user-row:hover { background: #f5f6fa; }
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}
.user-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e8eaf0;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 14px; font-weight: 500; color: #1a1d2e; }
.user-email { font-size: 12px; color: #8b92a5; }
.user-table-count { font-size: 12px; color: #787774; white-space: nowrap; }
.user-actions { display: flex; gap: 4px; flex-shrink: 0; }
</style>
