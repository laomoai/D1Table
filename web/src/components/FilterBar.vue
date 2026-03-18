<template>
  <div v-if="columns.length" class="filter-bar">
    <div v-for="(filter, idx) in filters" :key="idx" class="filter-row">
      <n-select
        v-model:value="filter.field"
        :options="columnOptions"
        placeholder="Select field"
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
        placeholder="Value"
        style="width: 160px;"
        size="small"
        @keyup.enter="emit('change', filters)"
      />
      <n-button size="small" quaternary @click="removeFilter(idx)">✕</n-button>
    </div>

    <div class="filter-actions">
      <n-button size="small" dashed @click="addFilter">+ Add Condition</n-button>
      <n-button
        v-if="filters.length"
        size="small"
        type="primary"
        @click="emit('change', filters)"
      >
        Apply
      </n-button>
      <n-button
        v-if="filters.length"
        size="small"
        @click="clearFilters"
      >
        Clear
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NSelect, NInput, NButton } from 'naive-ui'
import type { FieldMeta } from '@/api/client'

const props = defineProps<{ columns: FieldMeta[] }>()
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
    .map((c) => ({ label: c.title || c.column_name, value: c.column_name }))
)

const opOptions = [
  { label: 'Equals', value: 'eq' },
  { label: 'Not equals', value: 'ne' },
  { label: 'Contains', value: 'like' },
  { label: 'Does not contain', value: 'nlike' },
  { label: 'Greater than', value: 'gt' },
  { label: 'Greater than or equal', value: 'gte' },
  { label: 'Less than', value: 'lt' },
  { label: 'Less than or equal', value: 'lte' },
]

function addFilter() {
  filters.value.push({
    field: props.columns.find((c) => !c.isPrimaryKey)?.column_name ?? '',
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
