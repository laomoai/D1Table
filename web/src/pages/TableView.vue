<template>
  <div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
    <n-spin v-if="fieldsLoading" style="padding: 60px;" />
    <n-result
      v-else-if="fieldsError"
      status="error"
      :title="`Failed to load table ${tableName}`"
      :description="(fieldsError as Error).message"
    />
    <DataGrid
      v-else-if="fields && viewMode === 'grid'"
      :table-name="tableName"
      :fields="fields"
      :table-title="tableTitle"
      :table-icon="tableIcon"
      :total-count="totalCount"
      :is-locked="isTableLocked"
      @refresh="refetchTables"
      @switch-view="switchView"
    />
    <GalleryView
      v-else-if="fields && viewMode === 'gallery'"
      :table-name="tableName"
      :fields="fields"
      :table-title="tableTitle"
      :table-icon="tableIcon"
      :total-count="totalCount"
      :is-locked="isTableLocked"
      @refresh="refetchTables"
      @switch-view="switchView"
    />
    <ChartView
      v-else-if="fields && viewMode === 'chart'"
      :table-name="tableName"
      :fields="fields"
      :table-title="tableTitle"
      :table-icon="tableIcon"
      :total-count="totalCount"
      @switch-view="switchView"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, NResult } from 'naive-ui'
import { api } from '@/api/client'
import DataGrid from '@/components/DataGrid.vue'
import GalleryView from '@/components/GalleryView.vue'
import ChartView from '@/components/ChartView.vue'

const route = useRoute()
const queryClient = useQueryClient()

const tableName = computed(() => route.params.tableName as string)
const viewMode = ref<'grid' | 'gallery' | 'chart'>('grid')

// 切换表时重置视图
watch(tableName, () => { viewMode.value = 'grid' })

function switchView(v: string) {
  viewMode.value = v as 'grid' | 'gallery' | 'chart'
}

const {
  data: fields,
  isLoading: fieldsLoading,
  error: fieldsError,
} = useQuery({
  queryKey: computed(() => ['fields', tableName.value]),
  queryFn: () => api.getFieldMeta(tableName.value),
})

// 用 useQuery 订阅 tables 数据（响应式，缓存更新后自动重算）
const { data: tablesData } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

const totalCount = computed(() =>
  tablesData.value?.find(t => t.name === tableName.value)?.row_count ?? null
)

const tableTitle = computed(() =>
  tablesData.value?.find(t => t.name === tableName.value)?.title ?? null
)

const tableIcon = computed(() =>
  tablesData.value?.find(t => t.name === tableName.value)?.icon ?? null
)

const isTableLocked = computed(() =>
  tablesData.value?.find(t => t.name === tableName.value)?.is_locked ?? false
)

watch([tableTitle, tableIcon, tableName], ([title, icon, name]) => {
  const display = title || name
  const prefix = icon && !icon.startsWith('ion:') ? icon + ' ' : ''
  document.title = `${prefix}${display} - D1Table`
}, { immediate: true })

onUnmounted(() => { document.title = 'D1Table' })

function refetchTables() {
  queryClient.invalidateQueries({ queryKey: ['tables'] })
}
</script>
