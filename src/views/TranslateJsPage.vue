<script setup lang="ts">
/**
 * translate.js(xnx3) 整页多语言切换 Demo
 *
 * 与 /translate(文本框互译)不同,translate.js 直接扫描 DOM 把整块内容翻译成目标语言:
 *  - 无 API Key、MIT 开源免费,默认走作者自建翻译服务节点(国内可直连,无需科学上网)
 *  - translate.setDocuments([el]) 把翻译范围限定在示例文章区,不影响顶部菜单等 UI
 *  - class="ignore" 的元素(语言按钮组)默认被其忽略规则排除,不会被翻译
 *  - translate.listener.start() 监控 Vue 动态渲染,新增文本也会被翻译
 *
 * 库本身无 npm 包(同名 npm 包是另一个库),官方推荐 CDN script 接入;
 * 这里在页面挂载时动态注入 <script>,避免污染其他 demo 路由。
 */
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";

const CDN = "https://cdn.staticfile.net/translate.js/3.18.66/translate.js";

const articleEl = ref<HTMLElement | null>(null);
const status = ref<"loading" | "ready" | "unreachable">("loading");
const currentLang = ref("chinese_simplified");
const extraParagraphs = ref<string[]>([]);

const statusText = computed(
  () =>
    ({
      loading: "加载中…",
      ready: "服务就绪",
      unreachable: "翻译服务不可达",
    })[status.value],
);
const statusColor = computed(
  () =>
    ({ loading: "orange", ready: "green", unreachable: "red" })[status.value],
);

const langOptions = [
  { code: "chinese_simplified", label: "中文" },
  { code: "english", label: "English" },
  { code: "japanese", label: "日本語" },
  { code: "korean", label: "한국어" },
  { code: "french", label: "Français" },
];

let loadPromise: Promise<void> | null = null;

// 动态注入 CDN 脚本,全局只加载一次
function loadTranslateJs(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if ((window as any).translate) return resolve();
    const script = document.createElement("script");
    script.src = CDN;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("translate.js CDN 加载失败"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

// 真实探测翻译服务是否可达(区别于「库加载成功」),避免误报就绪
async function probeService(): Promise<boolean> {
  try {
    const r = await fetch("https://api.translate.zvo.cn/init.json?v=3.18.66", {
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function initTranslate() {
  try {
    await loadTranslateJs();
    const t = (window as any).translate;
    if (!t) throw new Error("translate 对象不存在");
    t.language.setLocal("chinese_simplified"); // 当前页面本地语种
    t.service.use("client.edge"); // 免费翻译服务通道(作者自建节点,国内可直连)
    if (articleEl.value) {
      // 只翻译指定区域,整页 App 的菜单/按钮不受影响
      t.setDocuments([articleEl.value]);
    }
    t.listener.start(); // 监控 DOM 变动,Vue 后续动态渲染的内容也会被翻译
    t.execute();
    status.value = (await probeService()) ? "ready" : "unreachable";
  } catch (err) {
    status.value = "unreachable";
    message.error(err instanceof Error ? err.message : "初始化失败");
  }
}

function changeLang(code: string) {
  const t = (window as any).translate;
  if (!t) return message.error("translate.js 尚未加载");
  if (status.value === "unreachable")
    return message.warning(
      "翻译服务不可达:请关闭系统代理(科学上网),或对 *.zvo.cn 设置直连规则后重试",
    );
  t.changeLanguage(code);
  currentLang.value = code;
}

// 动态插入段落,演示 listener 对 Vue 新渲染文本的自动翻译
function addParagraph() {
  extraParagraphs.value.push(
    "这是一段动态追加的中文内容,用于验证翻译引擎对 Vue 响应式渲染文本的自动监听。",
  );
}

onMounted(initTranslate);
</script>

<template>
  <div class="translate-js-page">
    <a-card title="translate.js 整页自动翻译(xnx3 开源库)" :bordered="false">
      <a-alert type="success" show-icon class="tip">
        <template #message>
          无需 API Key、国内可直连(走作者自建免费翻译节点)。注意:它不需要科
          学上网,开着代理反而可能被分流到海外节点导致失败——若状态显示「服务
          不可达」,请关闭代理或将 *.zvo.cn 加入直连规则。本 Demo 用
          <code>setDocuments</code> 把翻译范围限定在下方文章区,顶部导航等 UI
          不受影响;语言按钮带 <code>class="ignore"</code> 亦被排除。
        </template>
      </a-alert>

      <!-- 语言切换按钮组:class="ignore" 不会被翻译 -->
      <div class="lang-bar ignore">
        <a-space>
          <a-button
            v-for="opt in langOptions"
            :key="opt.code"
            :type="currentLang === opt.code ? 'primary' : 'default'"
            :disabled="status === 'loading'"
            @click="changeLang(opt.code)"
          >
            {{ opt.label }}
          </a-button>
        </a-space>
        <a-tag :color="statusColor">{{ statusText }}</a-tag>
      </div>

      <!-- 被翻译的文章区 -->
      <div ref="articleEl" class="article">
        <h2>产品发布公告 · 2026 春季版</h2>
        <p>
          我们很高兴地宣布,新一代智能翻译引擎今天正式上线。该引擎融合了大模型的
          语义理解能力,可在数毫秒内完成整页内容的翻译,并原生支持动态渲染的页面。
        </p>
        <p>
          This paragraph is written in English. Switch to 日本語 or 한국어 to
          see translate.js translate mixed-language content automatically.
        </p>
        <ul>
          <li>支持上百种语言的一键切换</li>
          <li>内置三层缓存与多线程加速</li>
          <li>对搜索引擎友好,不改动网页源代码</li>
        </ul>
        <blockquote>“翻译不是替换文字,而是传递意图。” —— 产品团队</blockquote>
        <p v-for="(p, i) in extraParagraphs" :key="i">{{ p }}</p>
      </div>

      <div class="actions ignore">
        <a-button :disabled="status === 'loading'" @click="addParagraph">
          动态追加一段中文(验证 DOM 监听自动翻译)
        </a-button>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.translate-js-page {
  padding-top: 16px;
}

.tip {
  margin-bottom: 16px;
}

.lang-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.article {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 24px 32px;
  background: #fff;
  line-height: 1.8;
}

.article h2 {
  margin-top: 0;
}

.article blockquote {
  margin: 16px 0;
  padding: 8px 16px;
  border-left: 4px solid #1677ff;
  background: #f5faff;
  color: #555;
}

.actions {
  margin-top: 16px;
}
</style>
