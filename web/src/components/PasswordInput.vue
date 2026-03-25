<template>
  <div style="display: flex; gap: 6px; width: 100%;">
    <n-input
      ref="inputRef"
      :value="modelValue"
      @update:value="$emit('update:modelValue', $event)"
      placeholder="Enter password"
      type="password"
      show-password-on="click"
      style="flex: 1;"
      @blur="$emit('blur')"
      @keyup.enter="$emit('enter')"
      @keyup.escape="$emit('escape')"
    />
    <n-tooltip trigger="hover">
      <template #trigger>
        <n-button quaternary size="small" @click="$emit('update:modelValue', generatePassword(true))">
          <span style="font-size: 13px;">A1#</span>
        </n-button>
      </template>
      生成 16 位密码（含特殊符号）
    </n-tooltip>
    <n-tooltip trigger="hover">
      <template #trigger>
        <n-button quaternary size="small" @click="$emit('update:modelValue', generatePassword(false))">
          <span style="font-size: 13px;">A1a</span>
        </n-button>
      </template>
      生成 16 位密码（无特殊符号）
    </n-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NTooltip } from 'naive-ui'

defineProps<{ modelValue: string | null }>()
defineEmits<{
  'update:modelValue': [value: string]
  blur: []
  enter: []
  escape: []
}>()

const inputRef = ref<{ focus?: () => void } | null>(null)

function focus() {
  inputRef.value?.focus?.()
}

defineExpose({ focus })

function generatePassword(withSymbols: boolean): string {
  const length = 16
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const symbols = '!@#$%^&*_+-='
  const all = upper + lower + digits + (withSymbols ? symbols : '')
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  const pick = (charset: string, byte: number) => charset[byte % charset.length]
  const chars = withSymbols
    ? [pick(upper, arr[0]), pick(lower, arr[1]), pick(digits, arr[2]), pick(symbols, arr[3])]
    : [pick(upper, arr[0]), pick(lower, arr[1]), pick(digits, arr[2])]
  const start = chars.length
  for (let i = start; i < length; i++) {
    chars.push(all[arr[i] % all.length])
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
</script>
