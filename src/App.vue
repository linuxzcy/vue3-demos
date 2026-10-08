<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import antdZhCN from "ant-design-vue/es/locale/zh_CN";
import antdEnUS from "ant-design-vue/es/locale/en_US";
import { currentLocale, setLocale, type AppLocale } from "./i18n";

const route = useRoute();
const router = useRouter();
// template 里用 t() 渲染菜单/标题（i18n 组合式用法）
const { t } = useI18n();

// 菜单项只存 i18n key，label 交给 t(key) 动态翻译
const navItems = [
  { path: "/chat", key: "menu.chat" },
  { path: "/tree", key: "menu.tree" },
  { path: "/websocket", key: "menu.websocket" },
  { path: "/sse", key: "menu.sse" },
  { path: "/sse-chatgpt", key: "menu.sseChatgpt" },
  { path: "/tinymce", key: "menu.tinymce" },
  { path: "/word-canvas", key: "menu.wordCanvas" },
  { path: "/amap", key: "menu.amap" },
  { path: "/logistics-track", key: "menu.logisticsTrack" },
  { path: "/scroll-spy", key: "menu.scrollSpy" },
  { path: "/excel", key: "menu.excel" },
  { path: "/chunk-upload", key: "menu.chunkUpload" },
  { path: "/logicflow", key: "menu.logicflow" },
  { path: "/print-dual-table", key: "menu.printDualTable" },
  { path: "/translate", key: "menu.translate" },
  { path: "/translate-js", key: "menu.translateJs" },
  { path: "/login", key: "menu.login" },
  { path: "/driver-js", key: "menu.driverJs" },
];

// 语言切换：本地 ref 驱动 antd ConfigProvider，setLocale 同步 vue-i18n 全局
const locale = ref<AppLocale>(currentLocale());
const antdLocale = computed(() =>
  locale.value === "zh-CN" ? antdZhCN : antdEnUS,
);

function handleLangChange(val: AppLocale) {
  locale.value = val;
  setLocale(val);
}

// 修正原先 @click 内联解构 key 的隐式 any：收敛为带类型的处理函数
function handleMenuClick(info: { key: string | number }) {
  router.push(String(info.key));
}

const selectedKey = computed(() => route.path);
</script>

<template>
  <a-config-provider :locale="antdLocale">
    <a-layout class="app-layout">
      <a-layout-header class="header">
        <div class="logo">{{ t("common.appName") }}</div>
        <a-menu
          theme="dark"
          mode="horizontal"
          :selected-keys="[selectedKey]"
          :items="navItems.map((n) => ({ key: n.path, label: t(n.key) }))"
          @click="handleMenuClick"
        />
        <a-select
          :value="locale"
          size="small"
          class="lang-select"
          @change="(v: AppLocale) => handleLangChange(v)"
        >
          <a-select-option value="zh-CN">{{ t("common.zh") }}</a-select-option>
          <a-select-option value="en-US">{{ t("common.en") }}</a-select-option>
        </a-select>
      </a-layout-header>
      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-config-provider>
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

.lang-select {
  width: 120px;
  flex: 0 0 auto;
}

.content {
  padding: 0 24px 24px;
  background: #f5f5f5;
}
</style>
