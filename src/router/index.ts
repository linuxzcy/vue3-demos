import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/chat' },
    { path: '/chat', name: 'Chat', component: () => import('../views/ChatPage.vue') },
    { path: '/tree', name: 'Tree', component: () => import('../views/TreePage.vue') },
    { path: '/websocket', name: 'WebSocket', component: () => import('../views/WebSocketPage.vue') },
    { path: '/sse', name: 'SSE', component: () => import('../views/SsePage.vue') },
    { path: '/tinymce', name: 'TinyMCE', component: () => import('../views/TinyMcePage.vue') },
  ],
})

export default router
