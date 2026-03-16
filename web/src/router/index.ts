import { createRouter, createWebHistory } from 'vue-router'
import { hasApiKey } from '@/api/client'

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
      ],
    },
  ],
})

// 导航守卫：未登录跳 /login，已登录访问 /login 跳首页
router.beforeEach((to) => {
  const authed = hasApiKey()
  if (!authed && !to.meta.guest) return '/login'
  if (authed && to.path === '/login') return '/'
})

export default router
