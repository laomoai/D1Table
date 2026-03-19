<template>
  <n-modal
    v-model:show="visible"
    :mask-closable="true"
    :bordered="false"
    @after-enter="emit('after-enter')"
  >
    <div class="modal-wrap" :style="wrapStyle">
      <div class="modal-header">
        <span class="modal-title">{{ title }}</span>
        <button class="modal-close" @click="visible = false">×</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="modal-footer">
        <slot name="footer" />
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NModal } from 'naive-ui'

const visible = defineModel<boolean>('show', { default: false })
const emit = defineEmits<{ 'after-enter': [] }>()

const props = withDefaults(defineProps<{
  title: string
  width?: string
  height?: string
}>(), {
  width: 'clamp(520px, 40vw, 960px)',
  height: 'clamp(520px, 65vh, 820px)',
})

const wrapStyle = computed(() => ({ width: props.width, height: props.height }))
</script>

<style scoped>
.modal-wrap {
  background: #fff;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
  flex-shrink: 0;
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #37352f;
}
.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #a3a19d;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  border-radius: 3px;
  transition: color 0.12s, background 0.12s;
}
.modal-close:hover { color: #37352f; background: rgba(55,53,47,0.06); }
.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #e9e9e7;
  flex-shrink: 0;
}
</style>
