<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo -->
      <div class="login-brand">
        <div class="login-logo">D1Table</div>
        <div class="login-subtitle">基于 Cloudflare D1 的数据管理平台</div>
      </div>

      <!-- 表单 -->
      <div class="login-form">
        <label class="login-label">API Key</label>
        <n-input
          v-model:value="inputKey"
          type="password"
          show-password-on="click"
          placeholder="输入 API Key 或 ADMIN_KEY"
          size="large"
          :status="errorMsg ? 'error' : undefined"
          @keyup.enter="handleConnect"
        />

        <n-alert v-if="errorMsg" type="error" style="margin-top: 12px;">
          {{ errorMsg }}
        </n-alert>

        <n-button
          type="primary"
          block
          size="large"
          :loading="connecting"
          :disabled="!inputKey.trim()"
          style="margin-top: 16px;"
          @click="handleConnect"
        >
          连接
        </n-button>
      </div>

      <!-- 帮助提示 -->
      <div class="login-help">
        <n-collapse>
          <n-collapse-item title="如何获取 API Key？" name="help">
            <ul class="help-list">
              <li>首次使用：输入部署时设置的 <code>ADMIN_KEY</code></li>
              <li>管理员可在「设置」中创建只读或读写的 API Key</li>
              <li>API Key 格式：<code>d1t_rw_...</code> 或 <code>d1t_ro_...</code></li>
            </ul>
          </n-collapse-item>
        </n-collapse>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NButton, NAlert, NCollapse, NCollapseItem } from 'naive-ui'
import { http, saveApiKey } from '@/api/client'

const router = useRouter()
const inputKey = ref('')
const connecting = ref(false)
const errorMsg = ref('')

async function handleConnect() {
  const key = inputKey.value.trim()
  if (!key) return

  connecting.value = true
  errorMsg.value = ''

  try {
    await http.get('/tables', { headers: { 'X-API-Key': key } })
    saveApiKey(key)
    router.replace('/')
  } catch (err) {
    errorMsg.value = (err as Error).message || '连接失败，请检查 API Key 是否正确'
  } finally {
    connecting.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7ff 0%, #e8ecff 100%);
}
.login-card {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(79, 110, 247, 0.12);
  padding: 40px 36px 32px;
}
.login-brand {
  text-align: center;
  margin-bottom: 32px;
}
.login-logo {
  font-size: 28px;
  font-weight: 800;
  color: #4F6EF7;
  letter-spacing: 1px;
}
.login-subtitle {
  font-size: 13px;
  color: #999;
  margin-top: 6px;
}
.login-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 8px;
}
.login-help {
  margin-top: 24px;
  border-top: 1px solid #f0f2f5;
  padding-top: 16px;
}
.help-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #666;
  line-height: 1.8;
}
.help-list code {
  background: #f0f2f5;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
