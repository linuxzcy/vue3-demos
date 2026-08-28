<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Editor from '@tinymce/tinymce-vue'

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

const content = ref('<p>在此编辑富文本内容...</p>')
const previewHtml = ref('')

const editorInit = {
  height: 480,
  language: 'zh_CN',
  language_url: '/tinymce/langs/zh_CN.js',
  skin_url: '/tinymce/skins/ui/oxide',
  content_css: '/tinymce/skins/content/default/content.min.css',
  promotion: false,
  branding: false,
  license_key: 'gpl',
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
        <a-card title="TinyMCE 富文本编辑器（自托管 · 无需 License Key）" size="small">
          <a-alert
            type="info"
            show-icon
            message="使用 npm 自托管 TinyMCE，设置 license_key: 'gpl'，无需 Cloud API Key"
            style="margin-bottom: 12px"
          />
          <Editor v-model="content" :init="editorInit" />
          <a-space style="margin-top: 12px">
            <a-button type="primary" @click="syncPreview">预览 HTML</a-button>
            <a-button @click="content = '<p></p>'">清空</a-button>
          </a-space>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="8">
        <a-card title="功能说明" size="small">
          <a-descriptions :column="1" size="small" bordered>
            <a-descriptions-item label="中文界面">zh_CN 语言包</a-descriptions-item>
            <a-descriptions-item label="图片上传">images_upload_handler + 拖拽粘贴</a-descriptions-item>
            <a-descriptions-item label="音视频">media 插件 + 文件选择器</a-descriptions-item>
            <a-descriptions-item label="表格">table 插件</a-descriptions-item>
            <a-descriptions-item label="代码">codesample 语法高亮</a-descriptions-item>
            <a-descriptions-item label="License">GPL 自托管，无 Cloud Key</a-descriptions-item>
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
