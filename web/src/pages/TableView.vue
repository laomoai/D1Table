<template>
  <div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
    <n-spin v-if="fieldsLoading" style="padding: 60px;" />
    <n-result
      v-else-if="fieldsError"
      status="error"
      :title="`无法加载表 ${tableName}`"
      :description="(fieldsError as Error).message"
    />
    <DataGrid
      v-else-if="fields"
      :table-name="tableName"
      :fields="fields"
      :table-title="tableTitle"
      :total-count="totalCount"
      @refresh="refetchTables"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, NResult } from 'naive-ui'
import { api } from '@/api/client'
import DataGrid from '@/components/DataGrid.vue'

const route = useRoute()
const queryClient = useQueryClient()

const tableName = computed(() => route.params.tableName as string)

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

function refetchTables() {
  queryClient.invalidateQueries({ queryKey: ['tables'] })
}
</script>
