<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Editor from '@tinymce/tinymce-vue'

// 自托管 TinyMCE 6（MIT）：无需 license_key，可闭源商用
import 'tinymce/tinymce'
import 'tinymce/themes/silver'
import 'tinymce/icons/default'
import 'tinymce/models/dom'

import 'tinymce/plugins/advlist'
import 'tinymce/plugins/autolink'
import 'tinymce/plugins/lists'
import 'tinymce/plugins/link'
import 'tinymce/plugins/image'
import 'tinymce/plugins/media'
import 'tinymce/plugins/table'
import 'tinymce/plugins/code'
import 'tinymce/plugins/codesample'
import 'tinymce/plugins/fullscreen'
import 'tinymce/plugins/preview'
import 'tinymce/plugins/searchreplace'
import 'tinymce/plugins/wordcount'
import 'tinymce/plugins/insertdatetime'
import 'tinymce/plugins/charmap'
import 'tinymce/plugins/anchor'
import 'tinymce/plugins/visualblocks'
import 'tinymce/plugins/visualchars'

import 'tinymce/skins/ui/oxide/skin.min.css'

const content = ref('<p>在此编辑富文本内容...</p>')
const previewHtml = ref('')

const editorInit = {
  height: 480,
  language: 'zh_CN',
  language_url: '/tinymce/langs/zh_CN.js',
  // 自托管皮肤：CSS 已 import，编辑器内 content 用 public 路径
  skin: false,
  content_css: '/tinymce/skins/content/default/content.min.css',
  promotion: false,
  branding: false,
  // TinyMCE 6 = MIT，不需要 license_key，也不会弹 GPL 提示
  menubar: 'file edit view insert format tools table help',
  plugins: [
    'advlist', 'autolink', 'lists', 'link', 'image', 'media', 'table',
    'code', 'codesample', 'fullscreen', 'preview', 'searchreplace',
    'wordcount', 'insertdatetime', 'charmap', 'anchor', 'visualblocks', 'visualchars',
  ],
  toolbar:
    'undo redo | blocks fontsize | bold italic underline strikethrough | ' +
    'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | ' +
    'link image media table codesample charmap | preview fullscreen code',
  images_upload_handler: (
    blobInfo: { blob: () => Blob; filename: () => string },
    progress: (percent: number) => void,
  ) =>
    new Promise<string>((resolve, reject) => {
      progress(30)
      const reader = new FileReader()
      reader.onload = async () => {
        progress(70)
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file: reader.result,
              filename: blobInfo.filename(),
            }),
          })
          const data = await res.json()
          progress(100)
          resolve(data.location)
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(blobInfo.blob())
    }),
  file_picker_types: 'image media',
  file_picker_callback: (
    callback: (url: string, meta: { alt?: string }) => void,
    _value: string,
    meta: { filetype: string },
  ) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = meta.filetype === 'image' ? 'image/*' : 'video/*,audio/*'

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: reader.result, filename: file.name }),
          })
          const data = await res.json()
          callback(data.location, { alt: file.name })
        } catch {
          callback(reader.result as string, { alt: file.name })
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  },
  media_live_embeds: true,
  extended_valid_elements: 'video[*],audio[*],source[*],iframe[*]',
}

function syncPreview() {
  previewHtml.value = content.value
}

onMounted(syncPreview)
</script>

<template>
  <div class="tinymce-page">
    <a-row :gutter="16">
      <a-col :xs="24" :lg="16">
        <a-card title="TinyMCE 6 富文本（MIT · 无 License 提示）" size="small">
          <a-alert
            type="success"
            show-icon
            style="margin-bottom: 12px"
            message="已使用 TinyMCE 6（MIT 协议）"
            description="MIT 可闭源商用、次数不限、无需 license_key。TinyMCE 7/8 改为 GPL，必须写 license_key:'gpl' 或买商业授权，才会一直提示。"
          />
          <Editor v-model="content" :init="editorInit" />
          <a-space style="margin-top: 12px">
            <a-button type="primary" @click="syncPreview">预览 HTML</a-button>
            <a-button @click="content = '<p></p>'">清空</a-button>
          </a-space>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="8">
        <a-card title="License 说明" size="small">
          <a-descriptions :column="1" size="small" bordered>
            <a-descriptions-item label="当前版本">TinyMCE 6.8.x（MIT）</a-descriptions-item>
            <a-descriptions-item label="次数限制">无，无限次</a-descriptions-item>
            <a-descriptions-item label="闭源商用">可以（MIT）</a-descriptions-item>
            <a-descriptions-item label="中文界面">zh_CN 语言包</a-descriptions-item>
            <a-descriptions-item label="图片/音视频">上传 handler + media 插件</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <a-card title="HTML 预览" size="small" class="mt-card">
          <div class="preview-box" v-html="previewHtml" />
        </a-card>

        <a-card title="源码" size="small" class="mt-card">
          <pre class="code-box">{{ content }}</pre>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.tinymce-page {
  padding: 16px 0;
}

.mt-card {
  margin-top: 16px;
}

.preview-box {
  min-height: 120px;
  padding: 12px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  background: #fafafa;
  line-height: 1.7;
}

.preview-box :deep(img) {
  max-width: 100%;
}

.preview-box :deep(video),
.preview-box :deep(audio) {
  max-width: 100%;
}

.code-box {
  max-height: 200px;
  overflow: auto;
  font-size: 11px;
  background: #f6f8fa;
  padding: 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
