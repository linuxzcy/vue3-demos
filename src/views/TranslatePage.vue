<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message } from "ant-design-vue";

interface LangOption {
  code: string;
  name: string;
}

const MAX_CHARS = 5000;

const languages = ref<LangOption[]>([]);
const sourceLang = ref("auto");
const targetLang = ref("en");
const sourceText = ref("");
const resultText = ref("");
const detectedLang = ref("");
const loading = ref(false);

// 语种码 -> 中文名，用于展示检测结果
function langName(code: string): string {
  if (!code) return "";
  return languages.value.find((l) => l.code === code)?.name ?? code;
}

onMounted(async () => {
  try {
    const res = await fetch("/api/translate/languages");
    languages.value = await res.json();
  } catch {
    message.error("加载语言列表失败");
  }
});

async function doTranslate() {
  const text = sourceText.value.trim();
  if (!text) return message.warning("请输入要翻译的文本");
  if (text.length > MAX_CHARS)
    return message.warning(`单次翻译不能超过 ${MAX_CHARS} 字符`);

  loading.value = true;
  resultText.value = "";
  detectedLang.value = "";
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sl: sourceLang.value,
        tl: targetLang.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "翻译失败");
    resultText.value = data.text;
    detectedLang.value = data.detectedLang;
  } catch (err) {
    message.error(err instanceof Error ? err.message : "翻译失败");
  } finally {
    loading.value = false;
  }
}

// 交换源/目标语言：源为自动检测时，用检测到的语种参与交换
function swapLangs() {
  const from =
    sourceLang.value === "auto" ? detectedLang.value : sourceLang.value;
  sourceLang.value = targetLang.value === "zh-CN" ? "auto" : targetLang.value;
  targetLang.value = from || "en";
  // 把译文放回原文框，方便反向翻译
  if (resultText.value) {
    sourceText.value = resultText.value;
    resultText.value = "";
  }
}

async function copyResult() {
  if (!resultText.value) return;
  try {
    await navigator.clipboard.writeText(resultText.value);
    message.success("已复制译文");
  } catch {
    message.error("复制失败");
  }
}
</script>

<template>
  <div class="translate-page">
    <a-card title="谷歌翻译（免费接口 · 服务端代理）" :bordered="false">
      <a-alert type="info" show-icon class="tip">
        <template #message>
          走谷歌网页版公开翻译接口，无需 API Key；由本地 Express
          <code>/api/translate</code> 代理请求解决跨域。非官方接口仅供
          Demo，生产请改用官方 Cloud Translation（每月 50 万字符免费额度）或
          Azure / 百度 / DeepL。
        </template>
      </a-alert>

      <div class="lang-bar">
        <a-select
          v-model:value="sourceLang"
          style="width: 160px"
          :options="languages.map((l) => ({ value: l.code, label: l.name }))"
        />
        <a-button
          type="text"
          :disabled="sourceLang !== 'auto' && !detectedLang"
          title="交换语言"
          @click="swapLangs"
        >
          ⇄
        </a-button>
        <a-select
          v-model:value="targetLang"
          style="width: 160px"
          :options="
            languages
              .filter((l) => l.code !== 'auto')
              .map((l) => ({ value: l.code, label: l.name }))
          "
        />
        <a-tag v-if="detectedLang" color="blue">
          检测到：{{ langName(detectedLang) }}
        </a-tag>
      </div>

      <div class="editor-row">
        <div class="pane">
          <a-textarea
            v-model:value="sourceText"
            :maxlength="MAX_CHARS"
            :auto-size="{ minRows: 8, maxRows: 12 }"
            placeholder="输入要翻译的文本…"
          />
          <div class="pane-foot">{{ sourceText.length }} / {{ MAX_CHARS }}</div>
        </div>
        <div class="pane">
          <a-textarea
            :value="resultText"
            read-only
            :auto-size="{ minRows: 8, maxRows: 12 }"
            placeholder="译文…"
          />
          <div class="pane-foot">
            <a-button size="small" :disabled="!resultText" @click="copyResult">
              复制译文
            </a-button>
          </div>
        </div>
      </div>

      <div class="actions">
        <a-button
          type="primary"
          :loading="loading"
          :disabled="!sourceText.trim()"
          @click="doTranslate"
        >
          翻译
        </a-button>
        <a-button
          :disabled="!sourceText && !resultText"
          @click="
            sourceText = '';
            resultText = '';
            detectedLang = '';
          "
        >
          清空
        </a-button>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.translate-page {
  padding-top: 16px;
}

.tip {
  margin-bottom: 16px;
}

.lang-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.editor-row {
  display: flex;
  gap: 16px;
}

.pane {
  flex: 1;
  min-width: 0;
}

.pane-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
  color: #999;
  font-size: 12px;
  min-height: 24px;
}

.actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}
</style>
