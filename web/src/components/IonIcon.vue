<template>
  <n-icon :component="component ?? FallbackIcon" :size="size ?? 14" :style="component ? undefined : 'opacity:0.5'" />
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { NIcon } from 'naive-ui'
import { GridOutline as FallbackIcon } from '@vicons/ionicons5'
import * as AllIcons from '@vicons/ionicons5'

const props = defineProps<{ name: string; size?: number }>()

const component = computed<Component | null>(() =>
  (AllIcons as Record<string, Component>)[props.name] ?? null
)
</script>
