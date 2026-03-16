<template>
  <div class="dashboard">
    <div class="dash-header">
      <div>
        <h2 class="dash-title">Tables</h2>
        <p class="dash-desc">Manage all your data tables</p>
      </div>
      <n-button type="primary" @click="showCreateTable = true">+ New Table</n-button>
    </div>

    <n-spin v-if="isLoading" style="padding: 80px; display: flex; justify-content: center;" />

    <template v-else-if="tables?.length">
      <!-- Grouped display -->
      <template v-if="groupedSections.length > 0">
        <div v-for="section in groupedSections" :key="section.id" class="group-section">
          <div class="group-section-header">
            <span class="group-section-name">{{ section.name }}</span>
            <span class="group-section-count">{{ section.tables.length }} tables</span>
          </div>
          <div class="table-cards">
            <TableCard
              v-for="t in section.tables"
              :key="t.name"
              :table="t"
              :copied-id="copiedId"
              :editing-table="editingTable"
              :edit-title="editTitle"
              @click="router.push(`/tables/${t.name}`)"
              @copy="copyTableId"
              @edit="startEdit"
              @delete="confirmDeleteTable"
              @save-title="saveTitle"
              @cancel-edit="cancelEdit"
              @update:edit-title="editTitle = $event"
            />
          </div>
        </div>
      </template>

      <!-- Ungrouped tables -->
      <div v-if="ungroupedTables.length > 0" class="group-section">
        <div v-if="groupedSections.length > 0" class="group-section-header">
          <span class="group-section-name">Ungrouped</span>
          <span class="group-section-count">{{ ungroupedTables.length }} tables</span>
        </div>
        <div class="table-cards">
          <TableCard
            v-for="t in ungroupedTables"
            :key="t.name"
            :table="t"
            :copied-id="copiedId"
            :editing-table="editingTable"
            :edit-title="editTitle"
            @click="router.push(`/tables/${t.name}`)"
            @copy="copyTableId"
            @edit="startEdit"
            @delete="confirmDeleteTable"
            @save-title="saveTitle"
            @cancel-edit="cancelEdit"
            @update:edit-title="editTitle = $event"
          />
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <n-icon :component="GridOutline" :size="48" color="#ccc" />
      </div>
      <p class="empty-text">No tables yet</p>
      <n-button type="primary" @click="showCreateTable = true">Create your first table</n-button>
    </div>

    <!-- API docs section -->
    <div class="api-section">
      <div class="api-card">
        <div class="api-title">API</div>
        <p class="api-desc">
          D1Table provides a full REST API supporting table management, record CRUD, field configuration, and more.
          Integrate it with AI Agents, automation scripts, or third-party systems.
        </p>
        <div class="api-actions">
          <n-button tag="a" href="/api/docs" target="_blank" size="small" type="primary" ghost>
            View API Docs
          </n-button>
          <n-button tag="a" href="/api/openapi.json" target="_blank" size="small" quaternary>
            OpenAPI JSON
          </n-button>
        </div>
      </div>
    </div>

    <CreateTableModal
      v-model:show="showCreateTable"
      @created="(name) => { queryClient.invalidateQueries({ queryKey: ['tables'] }); router.push(`/tables/${name}`) }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NButton, NIcon, NSpin, useMessage } from 'naive-ui'
import { GridOutline } from '@vicons/ionicons5'
import { api, type TableMeta } from '@/api/client'
import CreateTableModal from '@/components/CreateTableModal.vue'
import TableCard from '@/components/TableCard.vue'

const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()
const showCreateTable = ref(false)
const copiedId = ref<string | null>(null)

function copyTableId(name: string) {
  navigator.clipboard.writeText(name)
  copiedId.value = name
  setTimeout(() => { copiedId.value = null }, 1500)
}

const { data: tables, isLoading } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

const { data: groups } = useQuery({
  queryKey: ['groups'],
  queryFn: api.getGroups,
  retry: false,
})

// Organize tables by group
const groupedSections = computed(() => {
  if (!groups.value || !tables.value || groups.value.length === 0) return []

  return groups.value
    .map(g => ({
      id: g.id,
      name: g.name,
      tables: tables.value!.filter(t => g.tables.includes(t.name)),
    }))
    .filter(s => s.tables.length > 0)
})

const ungroupedTables = computed(() => {
  if (!tables.value) return []
  if (!groups.value || groups.value.length === 0) return tables.value

  const groupedNames = new Set(groups.value.flatMap(g => g.tables))
  return tables.value.filter(t => !groupedNames.has(t.name))
})

// ── Inline edit table display name ──────────────────────────────────────────
const editingTable = ref<string | null>(null)
const editTitle = ref('')

function startEdit(t: TableMeta) {
  editingTable.value = t.name
  editTitle.value = t.title || t.name
}

function cancelEdit() {
  editingTable.value = null
}

async function confirmDeleteTable(t: TableMeta) {
  const confirmed = window.confirm(`Delete table ${t.title || t.name}? This action cannot be undone.`)
  if (!confirmed) return
  try {
    await api.deleteTable(t.name)
    message.success('Table deleted')
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function saveTitle(t: TableMeta) {
  const v = editTitle.value.trim()
  if (!v || v === (t.title || t.name)) { cancelEdit(); return }
  try {
    await api.updateTableTitle(t.name, v)
    message.success('Table name updated')
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
  cancelEdit()
}
</script>

<style scoped>
.dashboard {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px;
}
.dash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
}
.dash-title { font-size: 22px; font-weight: 700; color: #1a1d2e; margin: 0; }
.dash-desc { font-size: 13px; color: #999; margin: 4px 0 0; }
.group-section { margin-bottom: 24px; }
.group-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e8eaf0;
}
.group-section-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1d2e;
}
.group-section-count {
  font-size: 12px;
  color: #999;
}
.table-cards { display: flex; flex-direction: column; gap: 10px; }
.empty-state { text-align: center; padding: 80px 20px; }
.empty-icon { margin-bottom: 16px; }
.empty-text { font-size: 15px; color: #999; margin-bottom: 20px; }
/* API section */
.api-section { margin-top: 40px; }
.api-card {
  background: #f8f9fc; border: 1px solid #e8eaf0; border-radius: 10px;
  padding: 20px 24px;
}
.api-title { font-size: 15px; font-weight: 600; color: #1a1d2e; margin-bottom: 8px; }
.api-desc { font-size: 13px; color: #666; line-height: 1.7; margin: 0 0 14px; }
.api-actions { display: flex; gap: 10px; }
</style>
