import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/chat',
    },
    {
      path: '/tree',
      name: 'Tree',
      component: () => import('../views/TreePage.vue'),
    },
    {
      path: '/chat',
      name: 'Chat',
      component: () => import('../views/ChatPage.vue'),
    },
  ],
})

export default router
