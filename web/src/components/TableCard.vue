<template>
  <div class="table-card" @click="$emit('click')">
    <div class="card-icon">
      <n-icon :component="GridOutline" :size="24" color="#4F6EF7" />
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
          <button class="card-edit-btn" @click.stop="$emit('edit', table)" title="修改显示名">✎</button>
        </div>
      </template>
      <div class="card-id-row">
        <span class="card-id">ID: {{ table.name }}</span>
        <button class="card-copy-btn" @click.stop="$emit('copy', table.name)" title="复制表 ID">
          {{ copiedId === table.name ? '✓' : '⎘' }}
        </button>
      </div>
      <div class="card-stats">{{ table.row_count ?? 0 }} 条记录</div>
    </div>
    <button class="card-delete-btn" @click.stop="$emit('delete', table)" title="删除表">×</button>
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
  display: flex; align-items: center; gap: 16px;
  padding: 18px 20px; background: #fff;
  border: 1px solid #e8eaf0; border-radius: 10px;
  cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
}
.table-card:hover { border-color: #4F6EF7; box-shadow: 0 2px 12px rgba(79, 110, 247, 0.1); }
.card-icon {
  width: 44px; height: 44px; background: #f0f3ff; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.card-body { flex: 1; min-width: 0; }
.card-title {
  font-size: 15px; font-weight: 600; color: #1a1d2e;
  display: flex; align-items: center; gap: 6px;
}
.card-edit-btn {
  background: none; border: none; cursor: pointer;
  font-size: 13px; color: #bbb; padding: 2px 4px; border-radius: 3px;
  opacity: 0; transition: opacity .15s;
}
.table-card:hover .card-edit-btn { opacity: 1; }
.card-edit-btn:hover { color: #4F6EF7; background: #f0f3ff; }
.card-title-input {
  font-size: 15px; font-weight: 600; color: #1a1d2e;
  border: 1px solid #4F6EF7; border-radius: 4px;
  padding: 2px 8px; outline: none; width: 200px;
}
.card-id-row {
  display: flex; align-items: center; gap: 4px; margin-top: 3px;
}
.card-id {
  font-size: 11px; color: #aaa; font-family: monospace;
  background: #f5f6f8; padding: 1px 6px; border-radius: 3px;
}
.card-copy-btn {
  background: none; border: none; cursor: pointer;
  font-size: 13px; color: #bbb; padding: 0 3px; border-radius: 3px;
}
.card-copy-btn:hover { color: #4F6EF7; background: #f0f3ff; }
.card-stats { font-size: 12px; color: #999; margin-top: 4px; }
.card-delete-btn {
  background: none; border: none; cursor: pointer;
  font-size: 16px; color: #ccc; padding: 4px 6px; border-radius: 4px;
  opacity: 0; transition: opacity .15s, color .15s;
  flex-shrink: 0;
}
.table-card:hover .card-delete-btn { opacity: 1; }
.card-delete-btn:hover { color: #e53e3e; background: #fff5f5; }
.card-arrow { font-size: 20px; color: #ccc; flex-shrink: 0; }
</style>
