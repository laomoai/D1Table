import { createRouter, createWebHistory } from 'vue-router'
import { getCurrentUser } from '@/api/client'

// 模块级缓存，避免每次路由跳转都发请求
let authState: { authed: boolean; user: { email: string; name: string; picture: string } | null } = {
  authed: false,
  user: null,
}
let authChecked = false

export function resetAuthState() {
  authState = { authed: false, user: null }
  authChecked = false
}

export function getCachedUser() {
  return authState.user
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      component: () => import('@/components/AppLayout.vue'),
      children: [
        { path: '', component: () => import('@/pages/DashboardPage.vue') },
        { path: 'tables/:tableName', component: () => import('@/pages/TableView.vue') },
        { path: 'settings', component: () => import('@/pages/Settings.vue') },
        { path: 'notes', component: () => import('@/pages/NotesPage.vue') },
        { path: 'notes/:noteId', component: () => import('@/pages/NotesPage.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (!authChecked) {
    try {
      const user = await getCurrentUser()
      authState = { authed: true, user }
    } catch {
      authState = { authed: false, user: null }
    }
    authChecked = true
  }
  if (!authState.authed && !to.meta.guest) return '/login'
  if (authState.authed && to.path === '/login') return '/'
})

export default router
