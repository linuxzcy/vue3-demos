import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/tree',
    },
    {
      path: '/tree',
      name: 'Tree',
      component: () => import('../views/TreePage.vue'),
    },
  ],
})

export default router
