<template>
  <div class="actions-cell">
    <button class="act-btn" @click.stop="params.onEdit(params.data)">Edit</button>
    <button class="act-btn act-btn--danger" @click.stop="params.onDelete(params.data)">Delete</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  params: {
    data: Record<string, unknown>
    onEdit: (row: Record<string, unknown>) => void
    onDelete: (row: Record<string, unknown>) => void
  }
}>()
</script>

<style scoped>
.actions-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
}
.act-btn {
  background: none;
  border: 1px solid #e0e2e8;
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 12px;
  cursor: pointer;
  color: #555;
  line-height: 1.5;
  white-space: nowrap;
}
.act-btn:hover { background: #f0f2f5; }
.act-btn--danger { color: #d03050; border-color: #ffc0cb; }
.act-btn--danger:hover { background: #fff0f3; }
</style>
