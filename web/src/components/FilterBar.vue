<template>
  <div v-if="columns.length" class="filter-bar">
    <div v-for="(filter, idx) in filters" :key="idx" class="filter-row">
      <n-select
        v-model:value="filter.field"
        :options="columnOptions"
        placeholder="选择字段"
        style="width: 140px;"
        size="small"
      />
      <n-select
        v-model:value="filter.op"
        :options="opOptions"
        style="width: 110px;"
        size="small"
      />
      <n-input
        v-model:value="filter.value"
        placeholder="值"
        style="width: 160px;"
        size="small"
        @keyup.enter="emit('change', filters)"
      />
      <n-button size="small" quaternary @click="removeFilter(idx)">✕</n-button>
    </div>

    <div class="filter-actions">
      <n-button size="small" dashed @click="addFilter">+ 添加条件</n-button>
      <n-button
        v-if="filters.length"
        size="small"
        type="primary"
        @click="emit('change', filters)"
      >
        应用
      </n-button>
      <n-button
        v-if="filters.length"
        size="small"
        @click="clearFilters"
      >
        清除
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NSelect, NInput, NButton } from 'naive-ui'
import type { ColumnDef } from '@/api/client'

const props = defineProps<{ columns: ColumnDef[] }>()
const emit = defineEmits<{ change: [filters: Filter[]] }>()

export interface Filter {
  field: string
  op: string
  value: string
}

const filters = ref<Filter[]>([])

const columnOptions = computed(() =>
  props.columns
    .filter((c) => !c.isPrimaryKey)
    .map((c) => ({ label: `${c.name} (${c.type})`, value: c.name }))
)

const opOptions = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '包含', value: 'like' },
  { label: '不包含', value: 'nlike' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
]

function addFilter() {
  filters.value.push({
    field: props.columns.find((c) => !c.isPrimaryKey)?.name ?? '',
    op: 'eq',
    value: '',
  })
}

function removeFilter(idx: number) {
  filters.value.splice(idx, 1)
  emit('change', filters.value)
}

function clearFilters() {
  filters.value = []
  emit('change', [])
}
</script>

<style scoped>
.filter-bar {
  padding: 8px 16px;
  background: #f8f9fc;
  border-bottom: 1px solid #e8eaf0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
</style>
