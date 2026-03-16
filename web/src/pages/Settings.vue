<template>
  <div class="settings-page">
    <div class="settings-header">
      <h2 class="settings-title">Settings</h2>
    </div>

    <n-tabs type="line" animated>
      <!-- ─── Tab 1: Account ──────────────────────────────────── -->
      <n-tab-pane name="account" tab="Account">
        <div class="tab-content">
          <div class="section">
            <div class="section-label">Current Key</div>
            <div class="key-display">
              <n-tag :type="keyStatus.type" size="small">{{ keyStatus.label }}</n-tag>
              <code class="key-masked">{{ maskedKey }}</code>
            </div>
          </div>

          <div class="section">
            <div class="section-label">Change Key</div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <n-input
                v-model:value="inputKey"
                type="password"
                show-password-on="click"
                placeholder="Paste new API Key"
                style="max-width: 360px;"
                @keyup.enter="saveKey"
              />
              <n-button type="primary" :disabled="!inputKey" @click="saveKey">Save</n-button>
              <n-button :loading="testing" @click="testKey">Test</n-button>
            </div>
            <div class="hint">Key is stored only in browser localStorage and never sent to the server</div>
          </div>

          <div class="section">
            <n-button type="error" quaternary size="small" @click="logout">Sign out</n-button>
          </div>
        </div>
      </n-tab-pane>

      <!-- ─── Tab 2: Groups ──────────────────────────────────── -->
      <n-tab-pane name="groups" tab="Groups">
        <div class="tab-content">
          <div class="hint" style="margin-bottom: 16px;">
            Groups help organize your tables and can restrict API Keys to only access tables within specific groups
          </div>

          <n-spin v-if="groupsLoading" />
          <template v-else>
            <!-- Group list -->
            <div v-if="groupList?.length" class="group-list">
              <div v-for="g in groupList" :key="g.id" class="group-card">
                <div class="group-card-header">
                  <template v-if="editingGroup === g.id">
                    <n-input
                      v-model:value="editGroupName"
                      size="small"
                      style="flex: 1; max-width: 200px;"
                      @keyup.enter="saveGroupName(g.id)"
                      @keyup.escape="editingGroup = null"
                      autofocus
                    />
                    <n-button size="tiny" type="primary" @click="saveGroupName(g.id)">Confirm</n-button>
                    <n-button size="tiny" @click="editingGroup = null">Cancel</n-button>
                  </template>
                  <template v-else>
                    <span class="group-card-name" @click="startEditGroup(g)">{{ g.name }}</span>
                    <div class="group-card-actions">
                      <n-button size="tiny" quaternary @click="openGroupTableEditor(g)">Edit Tables</n-button>
                      <n-button size="tiny" quaternary type="error" @click="handleDeleteGroup(g.id)">Delete</n-button>
                    </div>
                  </template>
                </div>
                <div class="group-card-tables">
                  <template v-if="g.tables.length">
                    <n-tag
                      v-for="tn in g.tables"
                      :key="tn"
                      size="small"
                      :bordered="false"
                      style="margin: 2px;"
                    >
                      {{ getTableTitle(tn) }}
                    </n-tag>
                  </template>
                  <span v-else class="hint">No tables yet — click "Edit Tables" to add some</span>
                </div>
              </div>
            </div>

            <div v-else class="empty-hint">
              No groups yet
            </div>

            <!-- Create group -->
            <div class="create-group-row">
              <n-input
                v-model:value="newGroupName"
                placeholder="Enter group name"
                size="small"
                style="max-width: 200px;"
                @keyup.enter="handleCreateGroup"
              />
              <n-button
                type="primary"
                size="small"
                :disabled="!newGroupName.trim()"
                @click="handleCreateGroup"
              >
                Create Group
              </n-button>
            </div>
          </template>
        </div>
      </n-tab-pane>

      <!-- ─── Tab 3: API Keys ──────────────────────────────── -->
      <n-tab-pane name="keys" tab="API Keys">
        <div class="tab-content">
          <n-spin v-if="keysLoading" />
          <template v-else>
            <div v-if="keys?.length" class="key-list">
              <div v-for="k in keys" :key="k.id" class="key-card" :class="{ revoked: !k.is_active }">
                <div class="key-card-main">
                  <div class="key-card-name">{{ k.name }}</div>
                  <div class="key-card-meta">
                    <code class="key-prefix">{{ k.key_prefix }}...</code>
                    <n-tag :type="k.type === 'readonly' ? 'info' : 'warning'" size="tiny">
                      {{ k.type === 'readonly' ? 'Read-only' : 'Read-write' }}
                    </n-tag>
                    <n-tag v-if="k.scope === 'groups'" size="tiny" :bordered="false">
                      {{ k.groups?.map(g => g.name).join(', ') || 'No groups' }}
                    </n-tag>
                    <n-tag v-else size="tiny" :bordered="false">All tables</n-tag>
                    <n-tag v-if="!k.is_active" type="error" size="tiny">Revoked</n-tag>
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
            Deleted records are kept in the trash for 30 days, then permanently deleted automatically
          </div>

          <n-spin v-if="trashLoading" />
          <template v-else>
            <div v-if="trashItems?.length" class="trash-list">
              <div v-for="item in trashItems" :key="item.id" class="trash-card">
                <div class="trash-card-main">
                  <div class="trash-card-header">
                    <span class="trash-card-table">{{ getTableTitle(item.table_name) }}</span>
                    <code class="trash-card-id">ID: {{ item.record_id }}</code>
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
            <div v-else class="empty-hint">Trash is empty</div>

            <n-button
              v-if="trashItems?.length"
              type="error"
              size="small"
              quaternary
              style="margin-top: 16px;"
              @click="handleEmptyTrash"
            >
              Empty Trash
            </n-button>
          </template>
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
        <span v-else class="hint">No groups yet — please create one in the "Groups" tab first</span>
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

  <!-- Edit group modal (rename + edit tables) -->
  <n-modal v-model:show="showGroupTableEditor" preset="card" style="width: 480px;" title="Edit Group">
    <template v-if="editingGroupData">
      <n-form label-placement="left" label-width="70" style="margin-bottom: 8px;">
        <n-form-item label="Group Name">
          <n-input v-model:value="editingGroupName" placeholder="Group name" />
        </n-form-item>
      </n-form>
      <div style="font-size: 13px; color: #555; margin-bottom: 8px; font-weight: 500;">Included Tables</div>
      <n-checkbox-group v-model:value="selectedGroupTables">
        <n-space vertical>
          <n-checkbox
            v-for="t in allTables"
            :key="t.name"
            :value="t.name"
            :label="(t.title || t.name)"
          />
        </n-space>
      </n-checkbox-group>
    </template>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="showGroupTableEditor = false">Cancel</n-button>
        <n-button type="primary" :loading="savingGroupTables" @click="handleSaveGroupTables">Save</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import {
  NTabs, NTabPane, NForm, NFormItem, NInput, NButton, NText, NTag, NSpace,
  NSpin, NModal, NAlert, NRadioGroup, NRadio, NCheckboxGroup, NCheckbox,
  useMessage,
} from 'naive-ui'
import { api, http, saveApiKey, type ApiKeyInfo, type Group, type TableMeta, type TrashItem } from '@/api/client'

const message = useMessage()
const queryClient = useQueryClient()
const router = useRouter()

const inputKey = ref('')
const showCreate = ref(false)
const showNewKey = ref(false)
const newKeyValue = ref('')
const creating = ref(false)
const testing = ref(false)
const newKey = ref({
  name: '',
  type: 'readonly' as 'readonly' | 'readwrite',
  scope: 'all' as 'all' | 'groups',
  group_ids: [] as number[],
})

// ── Account ──────────────────────────────────────────────────────
const maskedKey = computed(() => {
  const k = localStorage.getItem('d1table_api_key') ?? ''
  if (!k) return 'Not set'
  return k.slice(0, 10) + '****' + k.slice(-4)
})

const keyStatus = computed(() => {
  const k = localStorage.getItem('d1table_api_key') ?? ''
  return k
    ? { type: 'success' as const, label: 'Set' }
    : { type: 'error' as const, label: 'Not set' }
})

function saveKey() {
  if (!inputKey.value.trim()) return
  saveApiKey(inputKey.value.trim())
  inputKey.value = ''
  message.success('API Key saved — reloading page')
  queryClient.invalidateQueries()
  setTimeout(() => window.location.reload(), 800)
}

async function testKey() {
  testing.value = true
  try {
    await http.get('/tables')
    message.success('Connection successful — key is valid')
  } catch (err) {
    message.error('Connection failed: ' + (err as Error).message)
  } finally {
    testing.value = false
  }
}

function logout() {
  localStorage.removeItem('d1table_api_key')
  queryClient.clear()
  router.push('/')
  setTimeout(() => window.location.reload(), 100)
}

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
    })
    newKeyValue.value = res.data.key
    showCreate.value = false
    showNewKey.value = true
    newKey.value = { name: '', type: 'readonly', scope: 'all', group_ids: [] }
    queryClient.invalidateQueries({ queryKey: ['admin-keys'] })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    creating.value = false
  }
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

// ── Groups ──────────────────────────────────────────────────
const newGroupName = ref('')
const editingGroup = ref<number | null>(null)
const editGroupName = ref('')

const { data: groupList, isLoading: groupsLoading } = useQuery({
  queryKey: ['groups'],
  queryFn: api.getGroups,
  retry: false,
})

const { data: allTables } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

function getTableTitle(name: string): string {
  const t = allTables.value?.find(t => t.name === name)
  return t?.title || name
}

async function handleCreateGroup() {
  if (!newGroupName.value.trim()) return
  try {
    await api.createGroup(newGroupName.value.trim())
    message.success('Group created')
    newGroupName.value = ''
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

function startEditGroup(g: Group) {
  editingGroup.value = g.id
  editGroupName.value = g.name
}

async function saveGroupName(id: number) {
  const name = editGroupName.value.trim()
  if (!name) { editingGroup.value = null; return }
  try {
    await api.updateGroup(id, { name })
    message.success('Group updated')
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  } catch (err) {
    message.error((err as Error).message)
  }
  editingGroup.value = null
}

async function handleDeleteGroup(id: number) {
  const confirmed = window.confirm('Delete this group? Tables inside will not be deleted.')
  if (!confirmed) return
  try {
    await api.deleteGroup(id)
    message.success('Group deleted')
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

// ── Edit tables in group ──────────────────────────────────────────
const showGroupTableEditor = ref(false)
const editingGroupData = ref<Group | null>(null)
const editingGroupName = ref('')
const selectedGroupTables = ref<string[]>([])
const savingGroupTables = ref(false)

function openGroupTableEditor(g: Group) {
  editingGroupData.value = g
  editingGroupName.value = g.name
  selectedGroupTables.value = [...g.tables]
  showGroupTableEditor.value = true
}

async function handleSaveGroupTables() {
  if (!editingGroupData.value) return
  savingGroupTables.value = true
  try {
    const nameChanged = editingGroupName.value.trim() && editingGroupName.value.trim() !== editingGroupData.value.name
    if (nameChanged) {
      await api.updateGroup(editingGroupData.value.id, { name: editingGroupName.value.trim() })
    }
    await api.setGroupTables(editingGroupData.value.id, selectedGroupTables.value)
    message.success('Group updated')
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    showGroupTableEditor.value = false
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    savingGroupTables.value = false
  }
}

// ── Trash ──────────────────────────────────────────────────
const { data: trashItems, isLoading: trashLoading } = useQuery({
  queryKey: ['trash'],
  queryFn: api.getTrash,
  retry: false,
})

function formatTrashPreview(data: Record<string, unknown>): string {
  const entries = Object.entries(data).filter(([k]) => k !== 'id' && k !== 'created_at')
  return entries.slice(0, 3).map(([, v]) => v == null ? '—' : String(v)).join(' / ')
}

function formatTrashTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function handleRestore(id: number) {
  try {
    await api.restoreTrash(id)
    message.success('Record restored')
    queryClient.invalidateQueries({ queryKey: ['trash'] })
    queryClient.invalidateQueries({ queryKey: ['records'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handlePermanentDelete(id: number) {
  const confirmed = window.confirm('Delete permanently? This action cannot be undone.')
  if (!confirmed) return
  try {
    await api.deleteTrash(id)
    message.success('Permanently deleted')
    queryClient.invalidateQueries({ queryKey: ['trash'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handleEmptyTrash() {
  const confirmed = window.confirm('Empty the trash? All records will be permanently deleted and cannot be recovered.')
  if (!confirmed) return
  try {
    await api.emptyTrash()
    message.success('Trash emptied')
    queryClient.invalidateQueries({ queryKey: ['trash'] })
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
.trash-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
</style>
