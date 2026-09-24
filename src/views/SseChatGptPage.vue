<script setup lang="ts">
/**
 * ChatGPT 风格 SSE 流式渲染演示(段级 tokenizer 版)
 *
 * 复刻 ChatGPT 网页版渲染管线(基于抓包/逆向分析):
 * 1. fetch + ReadableStream 收 SSE(复用 utils/sseFetch)
 * 2. 无打字机队列:delta 到达即拼进源文本(ChatGPT 按到达速度渲染,
 *    平滑靠「段冻结」而非匀速打字)
 * 3. 流式 tokenizer 把源文本按语法类型切成 segment:
 *    text / code / mermaid / math / table
 *    - 语法已闭合的段渲染一次即「冻结」,永不重渲
 *    - 只有最后一个未闭合段在 rAF 合帧下重渲
 * 4. 特殊段延后:代码围栏未闭合显示纯文本不高亮;$$ 未配对显示源码;
 *    mermaid 闭合后才渲染 SVG,并提供「预览/代码」tab(对齐 ChatGPT)
 * 5. pin-to-bottom:用户上翻即停自动滚动,回底自动恢复
 */
import { nextTick, reactive, ref } from "vue";
import { fetchSSE } from "../utils/sseFetch";
import { renderMarkdown } from "../utils/markdown";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

type SegType = "text" | "code" | "mermaid" | "math" | "table";

/** 一个渲染单元(对应 ChatGPT 的 segment 组件) */
interface Segment {
  id: number;
  type: SegType;
  source: string;
  html: string;
  /** mermaid 专属:预览/代码 tab 状态 */
  view: "code" | "preview";
}

interface GptMsg {
  id: string;
  role: "user" | "assistant";
  content: string; // 仅 user 消息使用
  segments: Segment[]; // 已闭合冻结的段(渲染一次后不再变动)
  live: { type: SegType; html: string } | null; // 唯一在流式中重渲的未闭合段
  streaming: boolean;
}

/** 一次流式回复的运行时上下文(不进响应式,避免大字符串深度代理) */
interface StreamCtx {
  msg: GptMsg;
  raw: string; // 已到达的全部源文本(delta 直接拼入,无打字机)
  frozen: number; // 已冻结段数
  dirty: boolean;
  rendering: boolean; // 异步渲染中标记(防重入)
  serverDone: boolean;
  rafId: number;
}

const topic = ref<"mixed" | "math" | "markdown" | "mermaid">("mixed");
const loading = ref(false);
const input = ref("");
const chatList = ref<GptMsg[]>([]);
const scrollRef = ref<HTMLElement | null>(null);
const pinned = ref(true); // 是否吸底

const topicOptions = [
  { label: "综合(含 mermaid)", value: "mixed" },
  { label: "数学公式", value: "math" },
  { label: "Markdown", value: "markdown" },
  { label: "Mermaid", value: "mermaid" },
];

// 演示统计:直观对比「全量重渲染」与「段级冻结」的差距
const stats = reactive({ chunks: 0, liveRenders: 0, frozenSegs: 0 });

// SSE 原始帧预览(取最近若干条 data:)
const rawFrames = ref<string[]>([]);

let abortController: AbortController | null = null;
let segSeq = 0;

const topicPrompt: Record<string, string> = {
  mixed: "用综合示例讲讲 SSE 流式渲染",
  math: "用 KaTeX 演示一组数学公式",
  markdown: "用 Markdown 讲讲表格和列表",
  mermaid: "画一张 SSE 处理的 mermaid 流程图",
};

/* ────────────────────── 流式 tokenizer ────────────────────── */

interface SegDesc {
  type: SegType;
  source: string;
  /** 语法是否已闭合(未闭合=还可能继续长) */
  closed: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
  );
}

/**
 * ChatGPT 式「按语法类型切段」(逐行简化版):
 * 代码围栏 / mermaid / 展示数学 $$ / 表格(连续 | 行) / 普通段落(空行分隔)
 * 不变式:未闭合段只可能出现在末尾(后续内容会被它吞掉)
 */
function tokenize(raw: string): SegDesc[] {
  const lines = raw.split("\n");
  const out: SegDesc[] = [];
  let cur: string[] = [];
  let i = 0;

  const flushText = () => {
    if (cur.length) {
      out.push({ type: "text", source: cur.join("\n"), closed: true });
      cur = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // ── 代码围栏(含 mermaid):闭合前整段吞入 ──
    const fence = line.match(/^\s*(?:```|~~~)\s*(\S*)\s*$/);
    if (fence) {
      flushText();
      const type: SegType =
        fence[1].toLowerCase() === "mermaid" ? "mermaid" : "code";
      const body: string[] = [line];
      let closed = false;
      i++;
      while (i < lines.length) {
        body.push(lines[i]);
        if (/^\s*(?:```|~~~)\s*$/.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        i++;
      }
      out.push({ type, source: body.join("\n"), closed });
      if (!closed) return out; // 未闭合围栏吞掉后面一切,等待流式继续
      continue;
    }

    // ── 展示数学 $$:单行配对即闭合,否则收集到闭合行 ──
    if (/^\s*\$\$/.test(line)) {
      flushText();
      if (/^\s*\$\$\S.*\$\$\s*$/.test(line)) {
        out.push({ type: "math", source: line, closed: true });
        i++;
        continue;
      }
      const body: string[] = [line];
      let closed = false;
      i++;
      while (i < lines.length) {
        body.push(lines[i]);
        if (/\$\$\s*$/.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        i++;
      }
      out.push({ type: "math", source: body.join("\n"), closed });
      if (!closed) return out;
      continue;
    }

    // ── 表格:连续 | 开头行;位于文本末尾视为仍在长行 ──
    if (/^\s*\|/.test(line)) {
      flushText();
      const body: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        out.push({ type: "table", source: body.join("\n"), closed: false });
        return out;
      }
      out.push({ type: "table", source: body.join("\n"), closed: true });
      continue;
    }

    // ── 空行:段落边界 ──
    if (line.trim() === "") {
      flushText();
      i++;
      continue;
    }

    cur.push(line);
    i++;
  }

  // 末尾未断行的段落(还可能继续流字)
  if (cur.length)
    out.push({ type: "text", source: cur.join("\n"), closed: false });
  return out;
}

/** 未闭合代码/mermaid 段:纯文本占位(不高亮、不出图) */
function liveCodeHtml(d: SegDesc): string {
  const m = d.source.match(/^\s*(?:```|~~~)\s*(\S*)/);
  const lang = m?.[1] || (d.type === "mermaid" ? "mermaid" : "text");
  const body = d.source.replace(/^\s*(?:```|~~~)\s*\S*\n?/, "");
  const badge =
    d.type === "mermaid"
      ? '<div class="stream-badge">◌ 图将在代码闭合后渲染</div>'
      : "";
  return `<div class="code-stream"><div class="code-lang">${escapeHtml(lang)} ●</div>${badge}<pre>${escapeHtml(body)}</pre></div>`;
}

/* ────────────────────── 渲染主循环(rAF) ────────────────────── */

async function pushFrozenSegment(ctx: StreamCtx, d: SegDesc) {
  ctx.msg.segments.push({
    id: ++segSeq,
    type: d.type,
    source: d.source,
    html: await renderMarkdown(d.source),
    view: d.type === "mermaid" ? "preview" : "code",
  });
  stats.frozenSegs++;
}

function startRenderLoop(ctx: StreamCtx) {
  const step = async () => {
    // 1. 段级渲染:闭合段冻结(一次),只重渲最后一个未闭合段
    if (ctx.dirty && !ctx.rendering) {
      ctx.dirty = false;
      ctx.rendering = true;
      const descs = tokenize(ctx.raw);

      while (ctx.frozen < descs.length && descs[ctx.frozen].closed) {
        await pushFrozenSegment(ctx, descs[ctx.frozen]);
        ctx.frozen++;
      }

      const tail = descs[descs.length - 1];
      if (tail && !tail.closed) {
        ctx.msg.live = {
          type: tail.type,
          html:
            tail.type === "code" || tail.type === "mermaid"
              ? liveCodeHtml(tail) // 围栏未闭合:纯文本占位
              : await renderMarkdown(tail.source), // 文本/表格逐行长出;$$ 未配对时 protectMath 不成对→保持原文
        };
        stats.liveRenders++;
      } else {
        ctx.msg.live = null;
      }
      ctx.rendering = false;
      scrollToBottomIfPinned();
    }

    // 2. 收尾:源文本已完整,最后一段也冻结进 segments
    if (ctx.serverDone && !ctx.dirty && !ctx.rendering) {
      const descs = tokenize(ctx.raw);
      while (ctx.frozen < descs.length) {
        await pushFrozenSegment(ctx, descs[ctx.frozen]);
        ctx.frozen++;
      }
      ctx.msg.live = null;
      ctx.msg.streaming = false;
      loading.value = false;
      scrollToBottomIfPinned();
      return;
    }
    ctx.rafId = requestAnimationFrame(step);
  };
  ctx.rafId = requestAnimationFrame(step);
}

/* ────────────────────── 流式入口 ────────────────────── */

async function startStream(userPrompt: string) {
  chatList.value.push({
    id: `u-${Date.now()}`,
    role: "user",
    content: userPrompt,
    segments: [],
    live: null,
    streaming: false,
  });

  const msg: GptMsg = {
    id: `a-${Date.now()}`,
    role: "assistant",
    content: "",
    segments: [],
    live: null,
    streaming: true,
  };
  chatList.value.push(msg);
  pinned.value = true;
  await scrollToBottom();

  loading.value = true;
  stats.chunks = 0;
  stats.liveRenders = 0;
  stats.frozenSegs = 0;
  rawFrames.value = [];

  const ctx: StreamCtx = {
    msg,
    raw: "",
    frozen: 0,
    dirty: false,
    rendering: false,
    serverDone: false,
    rafId: 0,
  };

  abortController = new AbortController();
  startRenderLoop(ctx);

  try {
    await fetchSSE(`/api/sse/stream?topic=${topic.value}`, {
      signal: abortController.signal,
      onEvent: (ev) => {
        if (ev.event === "done" || ev.data === "[DONE]") {
          ctx.serverDone = true;
          return;
        }
        stats.chunks++;
        rawFrames.value.push(ev.data);
        if (rawFrames.value.length > 12) rawFrames.value.shift();
        try {
          const { content } = JSON.parse(ev.data);
          // ChatGPT 同款:delta 到达直接拼进源文本,只置脏标记,渲染交给 rAF 合帧
          ctx.raw += content;
          ctx.dirty = true;
        } catch {
          /* 忽略非 JSON 帧 */
        }
      },
    });
    ctx.serverDone = true;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      // 用户点「停止」:就地收尾,保留已生成内容
      ctx.serverDone = true;
    } else {
      ctx.serverDone = true;
      if (!ctx.raw) {
        ctx.msg.segments.push({
          id: ++segSeq,
          type: "text",
          source: "",
          html: `<p class="conn-error">连接失败,请确认后端服务已启动(npm run dev:all)</p>`,
          view: "code",
        });
      }
    }
  } finally {
    abortController = null;
  }
}

function stopStream() {
  abortController?.abort();
}

function handleSend() {
  const text = input.value.trim() || topicPrompt[topic.value];
  input.value = "";
  startStream(text);
}

function clearChat() {
  chatList.value = [];
  rawFrames.value = [];
}

/* ────────────────────── 滚动(pin-to-bottom) ────────────────────── */

async function scrollToBottom() {
  await nextTick();
  const el = scrollRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function scrollToBottomIfPinned() {
  if (pinned.value) await scrollToBottom();
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement;
  // 距底部 60px 以内视为「贴底」;用户向上翻阅时暂停自动滚动
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}
</script>

<template>
  <div class="gpt-page">
    <a-row :gutter="16">
      <a-col :xs="24" :lg="6">
        <a-card title="ChatGPT 渲染管线" size="small">
          <a-steps direction="vertical" size="small" :current="10">
            <a-step
              title="ReadableStream"
              description="fetch 读字节流 + TextDecoder(stream) 按 SSE 规范解析"
            />
            <a-step
              title="无打字机队列"
              description="delta 到达即拼进源文本,平滑性不靠匀速吐字而靠段冻结(ChatGPT 同款)"
            />
            <a-step
              title="流式 tokenizer"
              description="按语法类型切段:text / code / mermaid / math / table"
            />
            <a-step
              title="闭合即冻结"
              description="整段渲染一次永不重渲,只有未闭合段每帧重渲(rAF 合帧)"
            />
            <a-step
              title="特殊段延后"
              description="代码闭合才高亮;$$ 配对才出公式;mermaid 闭合才出图"
            />
            <a-step
              title="mermaid 预览/代码 tab"
              description="对齐 ChatGPT 图块交互"
            />
            <a-step
              title="pin-to-bottom"
              description="用户上翻即停自动滚动,回底自动恢复"
            />
          </a-steps>
        </a-card>

        <a-card title="与全量重渲染对比" size="small" class="mt-card">
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="SSE 页(对照)"
              >每个 chunk 全量 parse + 整条 innerHTML 替换</a-descriptions-item
            >
            <a-descriptions-item label="本页"
              >无打字机,delta
              到达即并入;按语法类型切段,闭合段冻结</a-descriptions-item
            >
            <a-descriptions-item label="实时统计">
              <span class="mono">
                帧 {{ stats.chunks }} · 未闭合段重渲 {{ stats.liveRenders }} ·
                冻结段 {{ stats.frozenSegs }}
              </span>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>

        <a-card title="SSE 原始帧(最近 12 条)" size="small" class="mt-card">
          <div class="frame-list">
            <div v-for="(f, i) in rawFrames" :key="i" class="frame mono">
              data: {{ f }}
            </div>
            <a-empty
              v-if="!rawFrames.length"
              :image-style="{ height: '30px' }"
              description="发送消息后查看"
            />
          </div>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="18">
        <a-card size="small">
          <template #title>
            <div class="card-title-row">
              <span>ChatGPT 风格流式对话(段级 tokenizer 增量渲染)</span>
              <a-radio-group
                v-model:value="topic"
                :options="topicOptions"
                size="small"
                :disabled="loading"
              />
              <a-button
                size="small"
                type="text"
                :disabled="loading"
                @click="clearChat"
                >清空</a-button
              >
            </div>
          </template>

          <div ref="scrollRef" class="chat-window" @scroll="onScroll">
            <div
              v-for="msg in chatList"
              :key="msg.id"
              :class="['msg-row', msg.role]"
            >
              <div :class="['avatar', msg.role]">
                {{ msg.role === "user" ? "你" : "AI" }}
              </div>
              <div class="msg-body">
                <template v-if="msg.role === 'user'">
                  <div class="user-text">{{ msg.content }}</div>
                </template>
                <template v-else>
                  <!-- 冻结段:key 稳定,内容永不再触碰 -->
                  <template v-for="seg in msg.segments" :key="seg.id">
                    <!-- mermaid 图块:预览/代码 tab,对齐 ChatGPT -->
                    <div v-if="seg.type === 'mermaid'" class="mmd-card">
                      <div class="mmd-tabs">
                        <span class="mmd-title">mermaid</span>
                        <button
                          :class="[
                            'mmd-tab',
                            { active: seg.view === 'preview' },
                          ]"
                          @click="seg.view = 'preview'"
                        >
                          预览
                        </button>
                        <button
                          :class="['mmd-tab', { active: seg.view === 'code' }]"
                          @click="seg.view = 'code'"
                        >
                          代码
                        </button>
                      </div>
                      <div
                        v-show="seg.view === 'preview'"
                        class="md-body"
                        v-html="seg.html"
                      />
                      <pre v-show="seg.view === 'code'" class="mmd-code">{{
                        seg.source
                      }}</pre>
                    </div>
                    <div v-else class="md-body" v-html="seg.html" />
                  </template>
                  <!-- 唯一会反复重渲染的未闭合段 -->
                  <div v-if="msg.live" class="md-body" v-html="msg.live.html" />
                  <span v-if="msg.streaming" class="cursor">▍</span>
                </template>
              </div>
            </div>
            <a-empty
              v-if="!chatList.length"
              description="发送消息,体验 ChatGPT 同款渲染管线"
            />
          </div>

          <div v-if="!pinned && loading" class="jump-bottom">
            <a-button size="small" shape="round" @click="scrollToBottom"
              >回到底部 ↓</a-button
            >
          </div>

          <div class="input-bar">
            <a-input
              v-model:value="input"
              placeholder="输入问题,或直接点击发送体验块级增量渲染"
              :disabled="loading"
              @press-enter="handleSend"
            />
            <a-button v-if="loading" danger @click="stopStream"
              >停止生成</a-button
            >
            <a-button v-else type="primary" @click="handleSend">发送</a-button>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.gpt-page {
  padding: 16px 0;
}

.mt-card {
  margin-top: 16px;
}

.mono {
  font-family: "Fira Code", Consolas, monospace;
  font-size: 12px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.chat-window {
  height: 540px;
  overflow-y: auto;
  padding: 24px clamp(16px, 8%, 72px);
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  position: relative;
}

.msg-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  flex-shrink: 0;
}

.avatar.assistant {
  background: #10a37f;
}

.avatar.user {
  background: #5436da;
}

.msg-body {
  flex: 1;
  min-width: 0;
}

.user-text {
  white-space: pre-wrap;
  line-height: 1.7;
}

/* mermaid 图块:预览/代码 tab(ChatGPT 同款交互) */
.mmd-card {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  margin: 12px 0;
  overflow: hidden;
}

.mmd-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
}

.mmd-title {
  margin-right: auto;
  font-size: 12px;
  color: #999;
  font-family: Consolas, monospace;
}

.mmd-tab {
  border: none;
  background: transparent;
  padding: 2px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  color: #555;
}

.mmd-tab.active {
  background: #10a37f;
  color: #fff;
}

.mmd-code {
  margin: 0;
  padding: 12px;
  background: #0d1117;
  color: #c9d1d9;
  font-size: 12.5px;
  overflow-x: auto;
}

:deep(.math-stream) {
  background: #f6f8fa;
  border: 1px dashed #d9d9d9;
  padding: 8px 12px;
  border-radius: 6px;
  color: #888;
  white-space: pre-wrap;
  word-break: break-all;
}

.cursor {
  animation: blink 1s step-end infinite;
  color: #10a37f;
  font-weight: 700;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.jump-bottom {
  text-align: center;
  margin: -4px 0 8px;
}

.input-bar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.frame-list {
  max-height: 220px;
  overflow-y: auto;
}

.frame {
  background: #f6f8fa;
  border-radius: 4px;
  padding: 3px 8px;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.code-stream) {
  background: #0d1117;
  color: #c9d1d9;
  border-radius: 6px;
  margin: 12px 0;
  overflow: hidden;
}

:deep(.code-stream .code-lang) {
  padding: 4px 12px;
  font-size: 12px;
  color: #8b949e;
  background: #161b22;
  font-family: Consolas, monospace;
}

:deep(.stream-badge) {
  padding: 4px 12px;
  font-size: 12px;
  color: #d29922;
  background: #161b22;
  border-top: 1px solid #21262d;
}

:deep(.code-stream pre) {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
}

:deep(.conn-error) {
  color: #cf1322;
}

:deep(.md-body) {
  line-height: 1.7;
  color: #333;
  word-break: break-word;
}

:deep(.md-body h1),
:deep(.md-body h2),
:deep(.md-body h3) {
  margin: 16px 0 8px;
  font-weight: 600;
}

:deep(.md-body p) {
  margin: 8px 0;
}

:deep(.md-body ul),
:deep(.md-body ol) {
  padding-left: 22px;
  margin: 8px 0;
}

:deep(.md-body pre) {
  background: #f6f8fa;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
}

:deep(.md-body code) {
  font-family: "Fira Code", monospace;
  font-size: 13px;
}

:deep(.md-body blockquote) {
  border-left: 4px solid #ddd;
  padding-left: 12px;
  color: #666;
  margin: 12px 0;
}

:deep(.md-body table) {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
}

:deep(.md-body th),
:deep(.md-body td) {
  border: 1px solid #e8e8e8;
  padding: 8px 12px;
}

:deep(.md-body img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 8px 0;
}

:deep(.md-body .katex-display) {
  margin: 16px 0;
  overflow-x: auto;
}

:deep(.md-body .mermaid-wrap) {
  margin: 16px 0;
  overflow-x: auto;
  text-align: center;
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px;
}

:deep(.md-body .mermaid-wrap svg) {
  max-width: 100%;
  height: auto;
}

:deep(.md-body .mermaid-error) {
  background: #fff2f0;
  color: #cf1322;
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
}
</style>
