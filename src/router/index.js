import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../components/DispatchPage.vue')
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('../components/ReportsTab.vue')
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('../components/SubscriptionsTab.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router