<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { MATH_DEMO_MARKDOWN, MERMAID_DEMO_MARKDOWN, renderMarkdown } from '../utils/markdown'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'

interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  html?: string
  streaming?: boolean
}

const topic = ref<'mixed' | 'math' | 'markdown' | 'mermaid'>('mixed')
const loading = ref(false)
const input = ref('')
const chatList = ref<ChatItem[]>([])
const scrollRef = ref<HTMLElement | null>(null)

const topicOptions = [
  { label: '综合演示', value: 'mixed' },
  { label: '数学公式', value: 'math' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Mermaid', value: 'mermaid' },
]

async function scrollToBottom() {
  await nextTick()
  scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'smooth' })
}

async function updateHtml(item: ChatItem) {
  item.html = await renderMarkdown(item.content)
}

async function startStream(userPrompt: string) {
  chatList.value.push({
    id: `u-${Date.now()}`,
    role: 'user',
    content: userPrompt,
  })

  const assistant: ChatItem = {
    id: `a-${Date.now()}`,
    role: 'assistant',
    content: '',
    streaming: true,
  }
  chatList.value.push(assistant)
  await scrollToBottom()

  loading.value = true
  const es = new EventSource(`/api/sse/stream?topic=${topic.value}`)

  es.onmessage = async (event) => {
    try {
      const { content } = JSON.parse(event.data)
      assistant.content += content
      await updateHtml(assistant)
      await scrollToBottom()
    } catch {
      // [DONE] or parse error
    }
  }

  es.addEventListener('done', async () => {
    assistant.streaming = false
    loading.value = false
    es.close()
    await updateHtml(assistant)
  })

  es.onerror = () => {
    assistant.streaming = false
    loading.value = false
    es.close()
    if (!assistant.content) {
      assistant.content = '连接失败，请确认后端服务已启动（npm run dev:all）'
      updateHtml(assistant)
    }
  }
}

function handleSend() {
  const text = input.value.trim() || `请演示 ${topicOptions.find((o) => o.value === topic.value)?.label}`
  input.value = ''
  startStream(text)
}

/** 不依赖后端：直接本地流式 mock 数学公式，验证 KaTeX 渲染 */
async function playLocalStream(userText: string, content: string) {
  chatList.value.push({
    id: `u-${Date.now()}`,
    role: 'user',
    content: userText,
  })

  const assistant: ChatItem = {
    id: `a-${Date.now()}`,
    role: 'assistant',
    content: '',
    streaming: true,
  }
  chatList.value.push(assistant)
  await scrollToBottom()
  loading.value = true

  let i = 0
  const step = 6
  const timer = setInterval(async () => {
    if (i >= content.length) {
      clearInterval(timer)
      assistant.streaming = false
      loading.value = false
      await updateHtml(assistant)
      await scrollToBottom()
      return
    }
    assistant.content += content.slice(i, i + step)
    i += step
    await updateHtml(assistant)
    await scrollToBottom()
  }, 20)
}

function playLocalMathDemo() {
  topic.value = 'math'
  playLocalStream('请演示数学公式渲染', MATH_DEMO_MARKDOWN)
}

function playLocalMermaidDemo() {
  topic.value = 'mermaid'
  playLocalStream('请演示 Mermaid 流程图', MERMAID_DEMO_MARKDOWN)
}
</script>

<template>
  <div class="sse-page">
    <a-row :gutter="16">
      <a-col :xs="24" :lg="6">
        <a-card title="SSE 应用场景" size="small">
          <a-list size="small">
            <a-list-item>ChatGPT / Copilot 流式对话</a-list-item>
            <a-list-item>AI 代码补全实时输出</a-list-item>
            <a-list-item>服务器日志 tail -f</a-list-item>
            <a-list-item>进度条 / 长任务状态推送</a-list-item>
            <a-list-item>新闻 / 行情单向推送</a-list-item>
          </a-list>
        </a-card>

        <a-card title="演示主题" size="small" class="mt-card">
          <a-radio-group v-model:value="topic" :options="topicOptions" option-type="button" button-style="solid" block />
          <p class="hint">选择不同主题体验 Markdown、数学公式、Mermaid 流程图</p>
          <a-button
            block
            type="dashed"
            style="margin-top: 8px"
            :disabled="loading"
            @click="playLocalMathDemo"
          >
            本地 mock 数学公式
          </a-button>
          <a-button
            block
            type="dashed"
            style="margin-top: 8px"
            :disabled="loading"
            @click="playLocalMermaidDemo"
          >
            本地 mock Mermaid 流程图
          </a-button>
        </a-card>

        <a-card title="SSE vs WebSocket" size="small" class="mt-card">
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="SSE">单向、HTTP、自动重连、适合 AI 流式</a-descriptions-item>
            <a-descriptions-item label="WebSocket">双向、独立协议、适合聊天/游戏</a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="18">
        <a-card title="ChatGPT 风格流式对话" size="small">
          <div ref="scrollRef" class="chat-window">
            <div v-for="msg in chatList" :key="msg.id" :class="['chat-row', msg.role]">
              <div class="avatar">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
              <div class="bubble">
                <div v-if="msg.role === 'user'" class="user-text">{{ msg.content }}</div>
                <div v-else class="md-body" v-html="msg.html || ''" />
                <span v-if="msg.streaming" class="cursor">▍</span>
              </div>
            </div>
            <a-empty v-if="!chatList.length" description="发送消息开始流式演示" />
          </div>

          <div class="input-bar">
            <a-input
              v-model:value="input"
              placeholder="输入问题，或直接点击发送体验演示"
              :disabled="loading"
              @press-enter="handleSend"
            />
            <a-button type="primary" :loading="loading" @click="handleSend">发送</a-button>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.sse-page {
  padding: 16px 0;
}

.mt-card {
  margin-top: 16px;
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}

.chat-window {
  height: 520px;
  overflow-y: auto;
  padding: 16px;
  background: #f7f7f8;
  border-radius: 8px;
  margin-bottom: 12px;
}

.chat-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.chat-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: #10a37f;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.chat-row.user .avatar {
  background: #5436da;
}

.bubble {
  max-width: 85%;
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  position: relative;
}

.chat-row.user .bubble {
  background: #eef2ff;
}

.user-text {
  white-space: pre-wrap;
  line-height: 1.6;
}

.cursor {
  animation: blink 1s step-end infinite;
  color: #10a37f;
}

@keyframes blink {
  50% { opacity: 0; }
}

.input-bar {
  display: flex;
  gap: 8px;
}

:deep(.md-body) {
  line-height: 1.7;
  color: #333;
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
  padding-left: 20px;
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
  font-family: 'Fira Code', monospace;
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
