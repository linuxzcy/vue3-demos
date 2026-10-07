<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * driver.js 分步引导 Demo（v1.9.0，npm 引入）
 * 三种典型用法：
 * 1. 功能概览 tour：drive() 一次性跑完所有步骤
 * 2. 表单向导：onHighlighted 钩子里真实聚焦输入框；v1 默认允许与高亮元素交互（disableActiveInteraction 才关闭）
 * 3. 事件钩子：onHighlightStarted/onHighlighted/onDestroyStarted/onDestroyed 展示生命周期可控
 */

// ---------- 演示数据 ----------
const stats = reactive({ clicks: 0, done: 0 });

const tableData = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  name: `商品-${i + 1}`,
  price: (Math.random() * 100).toFixed(2),
  status: i % 3 === 0 ? "上架" : "下架",
}));

const columns = [
  { title: "ID", dataIndex: "id", key: "id", width: 80 },
  { title: "名称", dataIndex: "name", key: "name" },
  { title: "价格", dataIndex: "price", key: "price" },
  { title: "状态", dataIndex: "status", key: "status" },
];

const searchKeyword = ref("");
const form = reactive({ name: "", price: "", desc: "" });

// ---------- 通用：单例 driver，页面卸载时销毁 ----------
let currentDriver: ReturnType<typeof driver> | null = null;

function destroyCurrent() {
  currentDriver?.destroy();
  currentDriver = null;
}

onBeforeUnmount(destroyCurrent);

const commonConfig = {
  showProgress: true,
  overlayOpacity: 0.5,
  animate: true,
  prevBtnText: "上一步",
  nextBtnText: "下一步",
  doneBtnText: "完成",
};

// ---------- 1. 功能概览 tour ----------
function startOverviewTour() {
  destroyCurrent();
  currentDriver = driver({
    ...commonConfig,
    steps: [
      {
        element: "#tour-search",
        popover: {
          title: "① 搜索框",
          description:
            "driver.js 通过 CSS 选择器定位元素，高亮并弹出引导气泡。",
        },
      },
      {
        element: "#tour-stats",
        popover: {
          title: "② 统计卡片",
          description:
            "每一步都是真实 DOM 元素，滚动定位、居中都由库自动完成。",
        },
      },
      {
        element: "#tour-table",
        popover: {
          title: "③ 数据表格",
          description:
            "可以高亮任意容器；配合 allowInteraction 还能在引导中真实操作。",
          popoverClass: "driver-popover-wide",
        },
      },
      {
        element: "#tour-form",
        popover: {
          title: "④ 表单区",
          description: "概览引导结束后，可以试试下面的「表单填写向导」按钮。",
        },
      },
    ],
  });
  currentDriver.drive();
}

// ---------- 2. 表单向导（钩子里代填 + 真实交互） ----------
function startFormTour() {
  destroyCurrent();
  currentDriver = driver({
    ...commonConfig,
    showButtons: ["next", "previous"],
    steps: [
      {
        element: "#field-name",
        popover: {
          title: "商品名称",
          description:
            "这一步在 onHighlighted 钩子里自动聚焦输入框，点「下一步」时代填内容。",
          // 步骤级的 next 钩子要写在 popover 里（DriveStep 顶层没有 onNextClick）
          // 自定义后接管默认推进，需手动 moveNext()
          onNextClick: () => {
            form.name = "自动填入的商品";
            currentDriver?.moveNext();
          },
        },
        onHighlighted: (element) => {
          element?.querySelector<HTMLInputElement>("input")?.focus();
        },
      },
      {
        element: "#field-price",
        popover: {
          title: "价格（你可以自己输入）",
          description:
            "v1 默认允许与高亮元素真实交互（遮罩只在非活动区域生效），可直接在输入框里打字，写完点下一步。若需禁止交互用 disableActiveInteraction: true。",
        },
        onHighlighted: (element) => {
          element?.querySelector<HTMLInputElement>("input")?.focus();
        },
      },
      {
        element: "#field-desc",
        popover: {
          title: "描述",
          description: "最后一步同样可交互；点「完成」结束引导并触发销毁钩子。",
        },
        onHighlighted: (element) => {
          element?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
        },
      },
    ],
  });
  currentDriver.drive();
}

// ---------- 3. 生命周期钩子演示 ----------
const tourLog = ref<string[]>([]);

function startHookTour() {
  destroyCurrent();
  const push = (msg: string) =>
    tourLog.value.push(`${new Date().toLocaleTimeString()} ${msg}`);
  currentDriver = driver({
    ...commonConfig,
    steps: [
      {
        element: "#btn-overview",
        popover: {
          title: "钩子 1",
          description: "onHighlightStarted → onHighlighted",
        },
      },
      {
        element: "#btn-form",
        popover: {
          title: "钩子 2",
          description:
            "每次切步都会依次触发 deselected → highlightStarted → highlighted",
        },
      },
      {
        element: "#btn-hook",
        popover: {
          title: "钩子 3",
          description:
            "点 ✕ 关闭会触发 onDestroyStarted（钩子里必须调用 opts.driver.destroy() 才真正销毁）→ onDestroyed",
        },
      },
    ],
    // v1 生命周期钩子签名统一为 (element, step, opts)
    onHighlightStarted: (_element, step) =>
      push(`onHighlightStarted：${step?.element ?? "无元素"}`),
    onHighlighted: (_element, step) =>
      push(`onHighlighted：${step?.element ?? "无元素"}`),
    // 坑：v1.9 里自定义 onDestroyStarted 会接管销毁流程，必须手动调 opts.driver.destroy()，
    // 否则点 ✕ 关闭时引导卡住不消失（而外部直接 driverObj.destroy() 会跳过本钩子）
    onDestroyStarted: (_element, _step, opts) => {
      push(`onDestroyStarted：共切步 ${stats.done} 次`);
      opts.driver.destroy();
    },
    onDestroyed: () => {
      push("onDestroyed：引导已销毁");
      currentDriver = null;
    },
    // 注意：v1 里自定义 onNextClick 会接管默认推进，必须手动 moveNext()（末步销毁）
    onNextClick: () => {
      stats.done++;
      if (currentDriver?.hasNextStep()) {
        currentDriver.moveNext();
      } else {
        currentDriver?.destroy();
      }
    },
  });
  currentDriver.drive();
}

// 点击统计（模拟业务埋点）
function trackClick() {
  stats.clicks++;
}
</script>

<template>
  <div class="driver-demo-page">
    <a-card
      title="driver.js 分步引导 Demo"
      size="small"
      style="margin-bottom: 16px"
    >
      <a-space wrap @click="trackClick">
        <a-button type="primary" id="btn-overview" @click="startOverviewTour">
          ▶ 功能概览引导
        </a-button>
        <a-button id="btn-form" @click="startFormTour"
          >✍ 表单填写向导（可交互+代填）</a-button
        >
        <a-button id="btn-hook" @click="startHookTour"
          >🪝 生命周期钩子演示</a-button
        >
        <a-button danger @click="destroyCurrent">强制结束当前引导</a-button>
      </a-space>
    </a-card>

    <a-row id="tour-stats" :gutter="16" style="margin-bottom: 16px">
      <a-col :span="12">
        <a-card size="small">
          <a-statistic title="按钮点击次数（业务埋点）" :value="stats.clicks" />
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small">
          <a-statistic title="钩子引导中 next 次数" :value="stats.done" />
        </a-card>
      </a-col>
    </a-row>

    <a-card size="small" style="margin-bottom: 16px">
      <a-input
        id="tour-search"
        v-model:value="searchKeyword"
        placeholder="搜索商品…"
        allow-clear
        style="max-width: 300px"
      />
    </a-card>

    <a-card
      id="tour-table"
      title="商品列表"
      size="small"
      style="margin-bottom: 16px"
    >
      <a-table
        :columns="columns"
        :data-source="tableData"
        size="small"
        :pagination="false"
        row-key="id"
      />
    </a-card>

    <a-card
      id="tour-form"
      title="新增商品（表单向导目标区）"
      size="small"
      style="margin-bottom: 16px"
    >
      <a-form layout="vertical" style="max-width: 420px">
        <a-form-item id="field-name" label="商品名称">
          <a-input v-model:value="form.name" placeholder="引导第一步会代填" />
        </a-form-item>
        <a-form-item id="field-price" label="价格">
          <a-input
            v-model:value="form.price"
            placeholder="引导中可直接输入（allowInteraction）"
          />
        </a-form-item>
        <a-form-item id="field-desc" label="描述">
          <a-textarea
            v-model:value="form.desc"
            :rows="2"
            placeholder="引导中可直接输入"
          />
        </a-form-item>
      </a-form>
    </a-card>

    <a-card title="钩子日志" size="small">
      <div class="hook-log">
        <div v-for="(line, i) in tourLog" :key="i">{{ line }}</div>
        <a-empty
          v-if="!tourLog.length"
          description="点「生命周期钩子演示」后这里输出 onCreate/onChangeState/onDestroy"
        />
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.driver-demo-page {
  max-width: 900px;
}

.hook-log {
  background: #0d1117;
  color: #7ee787;
  font-family: Consolas, monospace;
  font-size: 12px;
  padding: 10px;
  border-radius: 8px;
  min-height: 90px;
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
}
</style>

<style>
/* 非 scoped：给 driver.js 弹出的气泡加宽样式（popoverClass 指定） */
.driver-popover-wide {
  max-width: 460px;
}
</style>
