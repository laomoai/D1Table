<template>
  <button class="expand-btn" @click.stop="params.onExpand(params.data, params.rowIndex)" title="Expand details">⤢</button>
</template>

<script setup lang="ts">
defineProps<{
  params: {
    data: Record<string, unknown>
    rowIndex: number
    onExpand: (row: Record<string, unknown>, idx: number) => void
  }
}>()
</script>

<style scoped>
.expand-btn {
  background: none;
  border: 1px solid #ccc;
  border-radius: 3px;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 10px;
  color: #666;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  visibility: hidden;
  padding: 0;
}
.expand-btn:hover {
  background: #f0f2ff;
  border-color: #4f6ef7;
  color: #4f6ef7;
}
</style>
