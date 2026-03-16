<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    :closable="false"
    preset="card"
    title="欢迎使用 D1Table"
    style="width: 420px;"
  >
    <n-space vertical>
      <n-text depth="2">请输入 API Key 以继续（首次使用请填写 ADMIN_KEY）</n-text>

      <n-input
        v-model:value="inputKey"
        type="password"
        show-password-on="click"
        placeholder="d1t_rw_... 或 ADMIN_KEY"
        size="large"
        @keyup.enter="handleLogin"
      />

      <n-alert v-if="errorMsg" type="error" :title="errorMsg" />
    </n-space>

    <template #footer>
      <n-button
        type="primary"
        block
        size="large"
        :loading="testing"
        @click="handleLogin"
      >
        确认
      </n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NModal, NInput, NButton, NText, NSpace, NAlert } from 'naive-ui'
import { http, saveApiKey } from '@/api/client'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ success: [] }>()

const inputKey = ref('')
const testing = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!inputKey.value.trim()) return

  testing.value = true
  errorMsg.value = ''
  try {
    // 用这个 key 测试一次 /api/tables，验证是否有效
    await http.get('/tables', {
      headers: { 'X-API-Key': inputKey.value.trim() },
    })
    saveApiKey(inputKey.value.trim())
    emit('success')
  } catch (err) {
    errorMsg.value = (err as Error).message || 'Key 无效，请检查后重试'
  } finally {
    testing.value = false
  }
}
</script>
