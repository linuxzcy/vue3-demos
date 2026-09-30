import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/chat" },
    {
      path: "/chat",
      name: "Chat",
      component: () => import("../views/ChatPage.vue"),
    },
    {
      path: "/tree",
      name: "Tree",
      component: () => import("../views/TreePage.vue"),
    },
    {
      path: "/websocket",
      name: "WebSocket",
      component: () => import("../views/WebSocketPage.vue"),
    },
    {
      path: "/sse",
      name: "SSE",
      component: () => import("../views/SsePage.vue"),
    },
    {
      path: "/sse-chatgpt",
      name: "SseChatGpt",
      component: () => import("../views/SseChatGptPage.vue"),
    },
    {
      path: "/tinymce",
      name: "TinyMCE",
      component: () => import("../views/TinyMcePage.vue"),
    },
    {
      path: "/word-canvas",
      name: "WordCanvas",
      component: () => import("../views/WordCanvasPage.vue"),
    },
    {
      path: "/amap",
      name: "Amap",
      component: () => import("../views/AmapPage.vue"),
    },
    {
      path: "/logistics-track",
      name: "LogisticsTrack",
      component: () => import("../views/LogisticsTrackPage.vue"),
    },
    {
      path: "/scroll-spy",
      name: "ScrollSpy",
      component: () => import("../views/ScrollSpyPage.vue"),
    },
    {
      path: "/excel",
      name: "Excel",
      component: () => import("../views/ExcelParsePage.vue"),
    },
    {
      path: "/chunk-upload",
      name: "ChunkUpload",
      component: () => import("../views/ChunkUploadPage.vue"),
    },
    {
      path: "/logicflow",
      name: "LogicFlow",
      component: () => import("../views/LogicFlowPage.vue"),
    },
    {
      path: "/print-dual-table",
      name: "PrintDualTable",
      component: () => import("../views/PrintDualTablePage.vue"),
    },
    {
      path: "/translate",
      name: "Translate",
      component: () => import("../views/TranslatePage.vue"),
    },
    {
      path: "/translate-js",
      name: "TranslateJs",
      component: () => import("../views/TranslateJsPage.vue"),
    },
    {
      path: "/login",
      name: "Login",
      component: () => import("../views/LoginPage.vue"),
    },
  ],
});

export default router;
