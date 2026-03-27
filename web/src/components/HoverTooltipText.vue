<template>
  <n-tooltip
    trigger="hover"
    :delay="delay"
    :disabled="disabled || !text"
  >
    <template #trigger>
      <component
        :is="as"
        :class="className"
        class="hover-tooltip-trigger"
      >
        <span class="hover-tooltip-content">{{ text }}</span>
      </component>
    </template>
    <span class="tooltip-text">{{ text }}</span>
  </n-tooltip>
</template>

<script setup lang="ts">
import { NTooltip } from 'naive-ui'

withDefaults(defineProps<{
  text: string
  className?: string
  as?: string
  disabled?: boolean
  delay?: number
}>(), {
  className: '',
  as: 'span',
  disabled: false,
  delay: 400,
})
</script>

<style scoped>
.hover-tooltip-trigger {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  margin: 0;
}

.hover-tooltip-content {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: normal;
}

.tooltip-text {
  white-space: pre-wrap;
  word-break: break-word;
  max-width: min(480px, 80vw);
}
</style>
