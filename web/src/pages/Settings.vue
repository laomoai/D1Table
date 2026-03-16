<template>
  <div class="settings-page">
    <div class="settings-header">
      <h2 class="settings-title">设置</h2>
    </div>

    <n-tabs type="line" animated>
      <!-- ─── Tab 1: 账号 ──────────────────────────────────── -->
      <n-tab-pane name="account" tab="账号">
        <div class="tab-content">
          <div class="section">
            <div class="section-label">当前 Key</div>
            <div class="key-display">
              <n-tag :type="keyStatus.type" size="small">{{ keyStatus.label }}</n-tag>
              <code class="key-masked">{{ maskedKey }}</code>
            </div>
          </div>

          <div class="section">
            <div class="section-label">更换 Key</div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <n-input
                v-model:value="inputKey"
                type="password"
                show-password-on="click"
                placeholder="粘贴新的 API Key"
                style="max-width: 360px;"
                @keyup.enter="saveKey"
              />
              <n-button type="primary" :disabled="!inputKey" @click="saveKey">保存</n-button>
              <n-button :loading="testing" @click="testKey">测试</n-button>
            </div>
            <div class="hint">Key 仅保存在浏览器 localStorage，不上传到服务器</div>
          </div>

          <div class="section">
            <n-button type="error" quaternary size="small" @click="logout">退出登录</n-button>
          </div>
        </div>
      </n-tab-pane>

      <!-- ─── Tab 2: 分组 ──────────────────────────────────── -->
      <n-tab-pane name="groups" tab="分组管理">
        <div class="tab-content">
          <div class="hint" style="margin-bottom: 16px;">
            分组可以整理你的数据表，也可以限制 API Key 只能访问特定分组内的表
          </div>

          <n-spin v-if="groupsLoading" />
          <template v-else>
            <!-- 分组列表 -->
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
                    <n-button size="tiny" type="primary" @click="saveGroupName(g.id)">确定</n-button>
                    <n-button size="tiny" @click="editingGroup = null">取消</n-button>
                  </template>
                  <template v-else>
                    <span class="group-card-name" @click="startEditGroup(g)">{{ g.name }}</span>
                    <div class="group-card-actions">
                      <n-button size="tiny" quaternary @click="openGroupTableEditor(g)">编辑表</n-button>
                      <n-button size="tiny" quaternary type="error" @click="handleDeleteGroup(g.id)">删除</n-button>
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
                  <span v-else class="hint">暂无表，点击「编辑表」添加</span>
                </div>
              </div>
            </div>

            <div v-else class="empty-hint">
              暂无分组
            </div>

            <!-- 新建分组 -->
            <div class="create-group-row">
              <n-input
                v-model:value="newGroupName"
                placeholder="输入分组名称"
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
                创建分组
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
                      {{ k.type === 'readonly' ? '只读' : '读写' }}
                    </n-tag>
                    <n-tag v-if="k.scope === 'groups'" size="tiny" :bordered="false">
                      {{ k.groups?.map(g => g.name).join('、') || '无分组' }}
                    </n-tag>
                    <n-tag v-else size="tiny" :bordered="false">全部表</n-tag>
                    <n-tag v-if="!k.is_active" type="error" size="tiny">已撤销</n-tag>
                  </div>
                </div>
                <n-button
                  v-if="k.is_active"
                  size="tiny"
                  type="error"
                  quaternary
                  @click="handleRevoke(k.id)"
                >
                  撤销
                </n-button>
              </div>
            </div>
            <div v-else class="empty-hint">暂无 API Key</div>

            <n-button type="primary" size="small" style="margin-top: 16px;" @click="showCreate = true">
              创建新 Key
            </n-button>
          </template>
        </div>
      </n-tab-pane>

      <!-- ─── Tab 4: 回收站 ──────────────────────────────── -->
      <n-tab-pane name="trash" tab="回收站">
        <div class="tab-content">
          <div class="hint" style="margin-bottom: 16px;">
            删除的记录会在回收站保留 30 天，之后自动永久删除
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
                    删除于 {{ formatTrashTime(item.deleted_at) }}
                  </div>
                </div>
                <div class="trash-card-actions">
                  <n-button size="tiny" type="primary" quaternary @click="handleRestore(item.id)">恢复</n-button>
                  <n-button size="tiny" type="error" quaternary @click="handlePermanentDelete(item.id)">永久删除</n-button>
                </div>
              </div>
            </div>
            <div v-else class="empty-hint">回收站为空</div>

            <n-button
              v-if="trashItems?.length"
              type="error"
              size="small"
              quaternary
              style="margin-top: 16px;"
              @click="handleEmptyTrash"
            >
              清空回收站
            </n-button>
          </template>
        </div>
      </n-tab-pane>

      <!-- ─── Tab 5: API 文档 ──────────────────────────────── -->
      <n-tab-pane name="docs" tab="API 文档">
        <div class="tab-content">
          <div class="section">
            <div class="section-label">OpenAPI 3.0 文档</div>
            <div style="display: flex; gap: 10px; margin-top: 8px;">
              <n-button tag="a" href="/api/docs" target="_blank" size="small" type="primary" ghost>
                查看 API 文档
              </n-button>
              <n-button tag="a" href="/api/openapi.json" target="_blank" size="small" quaternary>
                OpenAPI JSON
              </n-button>
            </div>
            <div class="hint" style="margin-top: 8px;">AI Agent 可读取此文档自动发现可用接口</div>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>

  <!-- 创建 Key 弹窗 -->
  <n-modal v-model:show="showCreate" preset="card" style="width: 480px;" title="创建 API Key">
    <n-form :model="newKey" label-placement="left" label-width="80">
      <n-form-item label="名称" :rule="{ required: true, message: '请输入名称' }">
        <n-input v-model:value="newKey.name" placeholder="如：AI Agent 只读 Key" />
      </n-form-item>
      <n-form-item label="权限">
        <n-radio-group v-model:value="newKey.type">
          <n-space>
            <n-radio value="readonly">只读</n-radio>
            <n-radio value="readwrite">读写</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <n-form-item label="访问范围">
        <n-radio-group v-model:value="newKey.scope">
          <n-space>
            <n-radio value="all">全部表</n-radio>
            <n-radio value="groups">指定分组</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <n-form-item v-if="newKey.scope === 'groups'" label="选择分组">
        <template v-if="groupList?.length">
          <n-checkbox-group v-model:value="newKey.group_ids">
            <n-space>
              <n-checkbox v-for="g in groupList" :key="g.id" :value="g.id" :label="g.name" />
            </n-space>
          </n-checkbox-group>
        </template>
        <span v-else class="hint">暂无分组，请先到「分组管理」创建</span>
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="showCreate = false">取消</n-button>
        <n-button type="primary" :loading="creating" @click="handleCreateKey">创建</n-button>
      </div>
    </template>
  </n-modal>

  <!-- 新 Key 展示弹窗 -->
  <n-modal v-model:show="showNewKey" preset="card" style="width: 480px;" title="请保存你的 API Key">
    <n-alert type="warning" style="margin-bottom: 12px;">
      此 Key 只显示一次，关闭后无法再次查看！
    </n-alert>
    <n-input :value="newKeyValue" readonly type="text" />
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <n-button @click="copyKey">复制</n-button>
        <n-button type="primary" @click="showNewKey = false">我已保存</n-button>
      </div>
    </template>
  </n-modal>

  <!-- 编辑分组弹窗（改名 + 编辑表） -->
  <n-modal v-model:show="showGroupTableEditor" preset="card" style="width: 480px;" title="编辑分组">
    <template v-if="editingGroupData">
      <n-form label-placement="left" label-width="70" style="margin-bottom: 8px;">
        <n-form-item label="分组名称">
          <n-input v-model:value="editingGroupName" placeholder="分组名称" />
        </n-form-item>
      </n-form>
      <div style="font-size: 13px; color: #555; margin-bottom: 8px; font-weight: 500;">包含的表</div>
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
        <n-button @click="showGroupTableEditor = false">取消</n-button>
        <n-button type="primary" :loading="savingGroupTables" @click="handleSaveGroupTables">保存</n-button>
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

// ── 账号 ──────────────────────────────────────────────────────
const maskedKey = computed(() => {
  const k = localStorage.getItem('d1table_api_key') ?? ''
  if (!k) return '未设置'
  return k.slice(0, 10) + '****' + k.slice(-4)
})

const keyStatus = computed(() => {
  const k = localStorage.getItem('d1table_api_key') ?? ''
  return k
    ? { type: 'success' as const, label: '已设置' }
    : { type: 'error' as const, label: '未设置' }
})

function saveKey() {
  if (!inputKey.value.trim()) return
  saveApiKey(inputKey.value.trim())
  inputKey.value = ''
  message.success('API Key 已保存，页面将刷新')
  queryClient.invalidateQueries()
  setTimeout(() => window.location.reload(), 800)
}

async function testKey() {
  testing.value = true
  try {
    await http.get('/tables')
    message.success('连接成功，Key 有效')
  } catch (err) {
    message.error('连接失败：' + (err as Error).message)
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
    message.warning('请输入名称')
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
    message.success('Key 已撤销')
    queryClient.invalidateQueries({ queryKey: ['admin-keys'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

function copyKey() {
  navigator.clipboard.writeText(newKeyValue.value)
  message.success('已复制到剪贴板')
}

// ── 分组管理 ──────────────────────────────────────────────────
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
    message.success('分组已创建')
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
    message.success('分组已更新')
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  } catch (err) {
    message.error((err as Error).message)
  }
  editingGroup.value = null
}

async function handleDeleteGroup(id: number) {
  const confirmed = window.confirm('确定删除此分组？分组内的表不会被删除。')
  if (!confirmed) return
  try {
    await api.deleteGroup(id)
    message.success('分组已删除')
    queryClient.invalidateQueries({ queryKey: ['groups'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

// ── 编辑分组内的表 ──────────────────────────────────────────
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
    message.success('分组已更新')
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    showGroupTableEditor.value = false
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    savingGroupTables.value = false
  }
}

// ── 回收站 ──────────────────────────────────────────────────
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
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function handleRestore(id: number) {
  try {
    await api.restoreTrash(id)
    message.success('记录已恢复')
    queryClient.invalidateQueries({ queryKey: ['trash'] })
    queryClient.invalidateQueries({ queryKey: ['records'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handlePermanentDelete(id: number) {
  const confirmed = window.confirm('确定永久删除？此操作不可恢复。')
  if (!confirmed) return
  try {
    await api.deleteTrash(id)
    message.success('已永久删除')
    queryClient.invalidateQueries({ queryKey: ['trash'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function handleEmptyTrash() {
  const confirmed = window.confirm('确定清空回收站？所有记录将永久删除，不可恢复。')
  if (!confirmed) return
  try {
    await api.emptyTrash()
    message.success('回收站已清空')
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

/* ── 分组卡片 ── */
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

/* ── 回收站 ── */
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

/* ── Key 列表 ── */
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
