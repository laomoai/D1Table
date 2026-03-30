import { createRouter, createWebHistory } from 'vue-router'
import { getCurrentUser } from '@/api/client'

// 模块级缓存，避免每次路由跳转都发请求
let authState: { authed: boolean; user: { email: string; name: string; picture: string; role?: string } | null } = {
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
        { path: '', component: () => import('@/pages/TableList.vue') },
        { path: 'tables/:tableName', component: () => import('@/pages/TableView.vue') },
        { path: 'settings', component: () => import('@/pages/Settings.vue') },
        { path: 'administration', component: () => import('@/pages/Administration.vue'), meta: { admin: true } },
        { path: 'notes', component: () => import('@/pages/NotesPage.vue') },
        { path: 'notes/:noteId', component: () => import('@/pages/NotesPage.vue') },
        { path: 'knowledge-base', component: () => import('@/pages/KnowledgeBase.vue') },
        { path: 'knowledge-base/:rootId', component: () => import('@/pages/KnowledgeBaseDetail.vue') },
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
  if (to.meta.admin && authState.user?.role !== 'admin') return '/'
})

export default router
