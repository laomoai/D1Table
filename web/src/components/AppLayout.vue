<template>
  <n-layout style="height: 100vh" has-sider>
    <!-- 左侧边栏 -->
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
        <span class="logo">D1Table</span>
        <n-button
          size="tiny"
          style="margin-left: auto; color: #8892b0;"
          quaternary
          @click.stop="showCreateTable = true"
          title="新建表"
        >＋</n-button>
      </div>

      <!-- 分组 + 表列表 -->
      <div class="table-list">
        <!-- 已分组的表 -->
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
              v-for="table in group.tables"
              :key="table.name"
              class="table-item grouped"
              :class="{ active: activeTable === table.name }"
              @click="navigateToTable(table.name)"
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

        <!-- 未分组的表 -->
        <template v-if="ungroupedTables.length > 0">
          <div
            v-if="groupedTables.length > 0"
            class="group-header"
            @click="toggleGroup(-1)"
          >
            <span class="group-arrow" :class="{ expanded: expandedGroups.has(-1) }">›</span>
            <span class="group-name">未分组</span>
            <span class="group-count">{{ ungroupedTables.length }}</span>
          </div>
          <template v-if="groupedTables.length === 0 || expandedGroups.has(-1)">
            <div
              v-for="table in ungroupedTables"
              :key="table.name"
              class="table-item"
              :class="{ active: activeTable === table.name, grouped: groupedTables.length > 0 }"
              @click="navigateToTable(table.name)"
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
        <n-button text size="small" style="color: #8892b0;" @click="router.push('/settings')">
          <template #icon><n-icon :component="SettingsIcon" /></template>
          设置
        </n-button>
      </div>
    </n-layout-sider>

    <CreateTableModal
      v-model:show="showCreateTable"
      @created="(name) => { queryClient.invalidateQueries({ queryKey: ['tables'] }); router.push(`/tables/${name}`) }"
    />

    <!-- 主内容区 -->
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
import { api, type TableMeta, type Group } from '@/api/client'
import { useMessage } from 'naive-ui'
import CreateTableModal from './CreateTableModal.vue'

const showCreateTable = ref(false)
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

// ── 分组折叠 ──────────────────────────────────────────────────
const expandedGroups = reactive(new Set<number>([-1])) // -1 = 未分组默认展开

function toggleGroup(id: number) {
  if (expandedGroups.has(id)) {
    expandedGroups.delete(id)
  } else {
    expandedGroups.add(id)
  }
}

// 计算分组后的表列表
const groupedTables = computed(() => {
  if (!groups.value || !tables.value || groups.value.length === 0) return []

  return groups.value
    .filter(g => g.tables.length > 0)
    .map(g => {
      // 首次出现自动展开
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

// ── 内联编辑表显示名 ──────────────────────────────────────────
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
    message.success('表名已更新')
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
  cancelTableEdit()
}
</script>

<style scoped>
.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid #2d3154;
  display: flex;
  align-items: center;
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
.sidebar-footer {
  position: absolute;
  bottom: 16px;
  left: 16px;
}
</style>
