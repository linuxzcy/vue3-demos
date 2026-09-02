<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { uploadLargeFile } from '../utils/chunkUpload'

const CHUNK_SIZE = 2 * 1024 * 1024
const CONCURRENCY = 6

const fileInputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const file = ref<File | null>(null)
const hashPercent = ref(0)
const uploadPercent = ref(0)
const phase = ref<'idle' | 'hashing' | 'uploading' | 'done' | 'error'>('idle')
const statusText = ref('拖拽文件到此处，或点击选择（支持视频大文件）')
const errorText = ref('')
const resultUrl = ref('')
const resultHash = ref('')
const instant = ref(false)
const skipped = ref(0)
const uploadedCount = ref(0)
const previewUrl = ref('')

let abort: AbortController | null = null

const isVideo = computed(() => !!file.value?.type.startsWith('video/'))
const fileMeta = computed(() => {
  if (!file.value) return ''
  const mb = (file.value.size / 1024 / 1024).toFixed(2)
  return `${file.value.name} · ${mb} MB · ${file.value.type || 'unknown'}`
})

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function pickFile(f: File | null | undefined) {
  if (!f) return
  revokePreview()
  file.value = f
  phase.value = 'idle'
  errorText.value = ''
  resultUrl.value = ''
  resultHash.value = ''
  instant.value = false
  hashPercent.value = 0
  uploadPercent.value = 0
  statusText.value = '已选择文件，点击开始上传'
  if (f.type.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(f.name)) {
    previewUrl.value = URL.createObjectURL(f)
  }
}

function onInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  pickFile(input.files?.[0])
  input.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  pickFile(e.dataTransfer?.files?.[0])
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragging.value = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
}

async function startUpload() {
  if (!file.value || phase.value === 'hashing' || phase.value === 'uploading') return

  abort?.abort()
  abort = new AbortController()
  phase.value = 'hashing'
  errorText.value = ''
  resultUrl.value = ''
  statusText.value = 'Web Worker 计算 MD5...'

  try {
    const res = await uploadLargeFile(file.value, {
      chunkSize: CHUNK_SIZE,
      concurrency: CONCURRENCY,
      signal: abort.signal,
      onHashProgress: (p) => {
        hashPercent.value = p
        statusText.value = `计算 MD5 ${p}%`
      },
      onUploadProgress: (p, done, total) => {
        phase.value = 'uploading'
        uploadPercent.value = p
        statusText.value = `管道上传 ${done}/${total}（并发 ≤ ${CONCURRENCY}） ${p}%`
      },
    })

    phase.value = 'done'
    resultUrl.value = res.url
    resultHash.value = res.hash
    instant.value = res.instant
    skipped.value = res.skippedChunks
    uploadedCount.value = res.uploadedChunks
    statusText.value = res.instant
      ? '秒传成功：服务端已存在相同文件'
      : `上传完成：新传 ${res.uploadedChunks} 片，跳过 ${res.skippedChunks} 片`
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      phase.value = 'idle'
      statusText.value = '已取消'
      return
    }
    phase.value = 'error'
    errorText.value = e instanceof Error ? e.message : String(e)
    statusText.value = '上传失败'
  }
}

function cancelUpload() {
  abort?.abort()
  abort = null
}

function clearFile() {
  cancelUpload()
  revokePreview()
  file.value = null
  phase.value = 'idle'
  statusText.value = '拖拽文件到此处，或点击选择（支持视频大文件）'
  errorText.value = ''
  resultUrl.value = ''
  hashPercent.value = 0
  uploadPercent.value = 0
}

onBeforeUnmount(() => {
  cancelUpload()
  revokePreview()
})
</script>

<template>
  <div class="page">
    <header class="head">
      <h1>大文件切片上传</h1>
      <p>
        MD5（Web Worker）· 秒传 · 断点续传 · 管道并发最多 {{ CONCURRENCY }} · 无 UI 组件 · 视频回显
      </p>
    </header>

    <div class="layout">
      <section class="panel">
        <div
          class="dropzone"
          :class="{ dragging, hasFile: !!file }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="fileInputRef?.click()"
        >
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            @change="onInputChange"
          />
          <div class="dz-icon">⬆</div>
          <div class="dz-title">{{ statusText }}</div>
          <div v-if="fileMeta" class="dz-meta">{{ fileMeta }}</div>
          <div class="dz-hint">切片 {{ (CHUNK_SIZE / 1024 / 1024).toFixed(0) }}MB · 并发管道 {{ CONCURRENCY }}</div>
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            :disabled="!file || phase === 'hashing' || phase === 'uploading'"
            @click="startUpload"
          >
            开始上传
          </button>
          <button
            class="btn"
            type="button"
            :disabled="phase !== 'hashing' && phase !== 'uploading'"
            @click="cancelUpload"
          >
            取消
          </button>
          <button class="btn ghost" type="button" @click="clearFile">清空</button>
        </div>

        <div class="progress-block">
          <div class="label">MD5 Hash</div>
          <div class="bar"><i :style="{ width: hashPercent + '%' }" /></div>
          <div class="pct">{{ hashPercent }}%</div>
        </div>
        <div class="progress-block">
          <div class="label">分片上传</div>
          <div class="bar upload"><i :style="{ width: uploadPercent + '%' }" /></div>
          <div class="pct">{{ uploadPercent }}%</div>
        </div>

        <p v-if="errorText" class="error">{{ errorText }}</p>

        <div v-if="resultUrl" class="result">
          <div><strong>结果</strong>：{{ instant ? '秒传' : '正常上传' }}</div>
          <div>MD5：<code>{{ resultHash }}</code></div>
          <div>跳过分片：{{ skipped }} · 实际上传：{{ uploadedCount }}</div>
          <div>
            URL：
            <a :href="resultUrl" target="_blank" rel="noreferrer">{{ resultUrl }}</a>
          </div>
        </div>

        <div class="tips">
          <h3>机制说明</h3>
          <ol>
            <li>Worker 按片读文件算 SparkMD5，不卡主线程</li>
            <li><code>/api/chunk/check</code>：已有完整文件 → 秒传；否则返回已上传 index → 断点续传</li>
            <li>管道池最多 6 个请求，任一结束立刻补下一个任务</li>
            <li><code>/api/chunk/merge</code> 服务端按序合并，静态目录回显视频</li>
          </ol>
        </div>
      </section>

      <section class="panel preview">
        <h2>视频回显</h2>
        <template v-if="resultUrl && (isVideo || /\.(mp4|webm|ogg|mov)$/i.test(file?.name || ''))">
          <video class="player" controls :src="resultUrl" />
          <p class="note">播放地址为服务端合并后的文件（需 npm run server / dev:all）</p>
        </template>
        <template v-else-if="previewUrl && isVideo">
          <video class="player" controls :src="previewUrl" />
          <p class="note">本地预览（上传前 ObjectURL）</p>
        </template>
        <div v-else class="empty">选择视频文件后，这里先本地预览；上传成功后切到服务器地址</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 16px 0 32px;
  color: #1f1f1f;
}

.head h1 {
  margin: 0 0 6px;
  font-size: 22px;
}

.head p {
  margin: 0 0 16px;
  color: #666;
  font-size: 13px;
}

.layout {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 16px;
}

.panel {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  padding: 16px;
}

.dropzone {
  border: 2px dashed #c5c5c5;
  border-radius: 12px;
  padding: 36px 16px;
  text-align: center;
  cursor: pointer;
  background: #fafafa;
  transition: 0.15s ease;
}

.dropzone.dragging,
.dropzone:hover {
  border-color: #1677ff;
  background: #f0f7ff;
}

.dropzone.hasFile {
  border-style: solid;
}

.hidden {
  display: none;
}

.dz-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.dz-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.dz-meta {
  font-size: 13px;
  color: #333;
  word-break: break-all;
}

.dz-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}

.actions {
  display: flex;
  gap: 8px;
  margin: 14px 0;
}

.btn {
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.btn.ghost {
  background: transparent;
}

.progress-block {
  display: grid;
  grid-template-columns: 72px 1fr 48px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.bar {
  height: 8px;
  background: #f0f0f0;
  border-radius: 99px;
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  width: 0;
  background: #722ed1;
  transition: width 0.15s linear;
}

.bar.upload i {
  background: #1677ff;
}

.pct {
  text-align: right;
  color: #666;
}

.error {
  color: #cf1322;
  font-size: 13px;
}

.result {
  margin-top: 12px;
  padding: 12px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-all;
}

.tips {
  margin-top: 16px;
  font-size: 13px;
  color: #555;
}

.tips h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.tips ol {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}

.preview h2 {
  margin: 0 0 12px;
  font-size: 16px;
}

.player {
  width: 100%;
  max-height: 420px;
  background: #000;
  border-radius: 8px;
}

.note {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
}

.empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  color: #999;
  background: #fafafa;
  border-radius: 8px;
  border: 1px dashed #ddd;
  padding: 24px;
  text-align: center;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
