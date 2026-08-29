<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/chat', label: '消息发送' },
  { path: '/tree', label: '树形勾选' },
  { path: '/websocket', label: 'WebSocket' },
  { path: '/sse', label: 'SSE 流式' },
  { path: '/tinymce', label: 'TinyMCE' },
  { path: '/amap', label: '高德地图' },
  { path: '/scroll-spy', label: '目录联动' },
]

const selectedKey = computed(() => route.path)
</script>

<template>
  <a-layout class="app-layout">
    <a-layout-header class="header">
      <div class="logo">Vue Demos</div>
      <a-menu
        theme="dark"
        mode="horizontal"
        :selected-keys="[selectedKey]"
        :items="navItems.map((n) => ({ key: n.path, label: n.label }))"
        @click="({ key }) => router.push(key as string)"
      />
    </a-layout-header>
    <a-layout-content class="content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 24px;
}

.logo {
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  white-space: nowrap;
}

.header :deep(.ant-menu) {
  flex: 1;
  min-width: 0;
  border-bottom: none;
}

.content {
  padding: 0 24px 24px;
  background: #f5f5f5;
}
</style>
