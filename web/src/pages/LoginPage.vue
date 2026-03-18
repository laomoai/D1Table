<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <img src="/logo.png" class="login-logo-img" alt="D1Table" />
        <div class="login-logo">D1Table</div>
        <div class="login-subtitle">Data management platform powered by Cloudflare D1</div>
      </div>

      <n-alert v-if="errorMsg" type="error" style="margin-bottom: 20px;">
        {{ errorMsg }}
      </n-alert>

      <a href="/api/auth/login" class="google-btn">
        <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span>Continue with Google</span>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert } from 'naive-ui'

const route = useRoute()

const errorMsg = computed(() => {
  const err = route.query.error as string
  if (!err) return ''
  const messages: Record<string, string> = {
    unauthorized_email: 'This Google account is not authorized to access D1Table.',
    invalid_state: 'Login failed due to an invalid state. Please try again.',
    oauth_failed: 'Google authentication failed. Please try again.',
  }
  return messages[err] ?? 'An unexpected error occurred. Please try again.'
})
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
.login-logo-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  margin-bottom: 12px;
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
.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 12px 24px;
  border: 1.5px solid #dadce0;
  border-radius: 8px;
  background: #fff;
  color: #3c4043;
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.google-btn:hover {
  background: #f8f9ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.google-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
