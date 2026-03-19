<template>
  <div class="table-card" @click="$emit('click')">
    <div class="card-icon">
      <n-icon :component="GridOutline" :size="20" color="#787774" />
    </div>
    <div class="card-body">
      <template v-if="editingTable === table.name">
        <input
          :value="editTitle"
          class="card-title-input"
          @input="$emit('update:editTitle', ($event.target as HTMLInputElement).value)"
          @keyup.enter="$emit('saveTitle', table)"
          @keyup.escape="$emit('cancelEdit')"
          @blur="$emit('saveTitle', table)"
          @click.stop
          ref="editInputRef"
        />
      </template>
      <template v-else>
        <div class="card-title">
          {{ table.title || table.name }}
          <button class="card-edit-btn" @click.stop="$emit('edit', table)" title="Edit display name">✎</button>
        </div>
      </template>
      <div class="card-id-row">
        <span class="card-id">ID: {{ table.name }}</span>
        <button class="card-copy-btn" @click.stop="$emit('copy', table.name)" title="Copy table ID">
          {{ copiedId === table.name ? '✓' : '⎘' }}
        </button>
      </div>
      <div class="card-stats">{{ table.row_count ?? 0 }} records</div>
    </div>
    <button class="card-delete-btn" @click.stop="$emit('delete', table)" title="Delete table">×</button>
    <div class="card-arrow">›</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import { GridOutline } from '@vicons/ionicons5'
import type { TableMeta } from '@/api/client'

const props = defineProps<{
  table: TableMeta
  copiedId: string | null
  editingTable: string | null
  editTitle: string
}>()

defineEmits<{
  click: []
  copy: [name: string]
  edit: [table: TableMeta]
  delete: [table: TableMeta]
  saveTitle: [table: TableMeta]
  cancelEdit: []
  'update:editTitle': [value: string]
}>()

const editInputRef = ref<HTMLInputElement>()

watch(() => props.editingTable, (val) => {
  if (val === props.table.name) {
    nextTick(() => editInputRef.value?.focus())
  }
})
</script>

<style scoped>
.table-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; background: #fff;
  border: 1px solid #e9e9e7; border-radius: 4px;
  cursor: pointer; transition: background 0.12s, border-color 0.12s;
}
.table-card:hover { background: #f7f7f5; border-color: #b3b0ab; }
.card-icon {
  width: 36px; height: 36px; background: #f1f1ef; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.card-body { flex: 1; min-width: 0; }
.card-title {
  font-size: 14px; font-weight: 600; color: #37352f;
  display: flex; align-items: center; gap: 6px;
}
.card-edit-btn {
  background: none; border: none; cursor: pointer;
  font-size: 12px; color: #a3a19d; padding: 2px 4px; border-radius: 3px;
  opacity: 0; transition: opacity .15s;
}
.table-card:hover .card-edit-btn { opacity: 1; }
.card-edit-btn:hover { color: #37352f; background: #e9e9e7; }
.card-title-input {
  font-size: 14px; font-weight: 600; color: #37352f;
  border: 1px solid #b3b0ab; border-radius: 3px;
  padding: 2px 8px; outline: none; width: 200px;
}
.card-id-row {
  display: flex; align-items: center; gap: 4px; margin-top: 3px;
}
.card-id {
  font-size: 11px; color: #a3a19d; font-family: monospace;
  background: #f1f1ef; padding: 1px 6px; border-radius: 3px;
}
.card-copy-btn {
  background: none; border: none; cursor: pointer;
  font-size: 12px; color: #a3a19d; padding: 0 3px; border-radius: 3px;
}
.card-copy-btn:hover { color: #37352f; background: #e9e9e7; }
.card-stats { font-size: 12px; color: #a3a19d; margin-top: 3px; }
.card-delete-btn {
  background: none; border: none; cursor: pointer;
  font-size: 16px; color: #ccc; padding: 4px 6px; border-radius: 3px;
  opacity: 0; transition: opacity .15s, color .15s;
  flex-shrink: 0;
}
.table-card:hover .card-delete-btn { opacity: 1; }
.card-delete-btn:hover { color: #eb5757; background: #fdf2f2; }
.card-arrow { font-size: 18px; color: #a3a19d; flex-shrink: 0; }
</style>
