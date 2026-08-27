<script setup lang="ts">
import { computed, h, nextTick, ref } from 'vue'
import {
  SmileOutlined,
  PaperClipOutlined,
  PictureOutlined,
  SendOutlined,
  DownOutlined,
} from '@ant-design/icons-vue'
import { storeToRefs } from 'pinia'
import { useMessageStore } from '../stores/messageStore'
import type { MessageAttachment, MessageImage, MessageVisibility } from '../types/message'

const emit = defineEmits<{
  send: []
}>()

const messageStore = useMessageStore()
const { users, currentUser } = storeToRefs(messageStore)

const content = ref('')
const visibility = ref<MessageVisibility>('public')
const emojiOpen = ref(false)
const mentionOpen = ref(false)
const mentionKeyword = ref('')
const mentionStart = ref(-1)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const pendingAttachments = ref<MessageAttachment[]>([])
const pendingImages = ref<MessageImage[]>([])

const emojiList = [
  '😀', '😂', '🥰', '😎', '🤔', '👍', '👏', '🎉', '❤️', '🔥',
  '✅', '❌', '⭐', '💡', '📎', '🖼️', '🚀', '💪', '🙏', '😅',
]

const visibilityOptions = [
  { label: '公开', value: 'public' },
  { label: '团队可见', value: 'team' },
  { label: '仅自己', value: 'private' },
]

const visibilityLabel = computed(
  () => visibilityOptions.find((o) => o.value === visibility.value)?.label ?? '公开',
)

const filteredUsers = computed(() => {
  const kw = mentionKeyword.value.toLowerCase()
  if (!kw) return users.value
  return users.value.filter(
    (u) => u.name.toLowerCase().includes(kw) && u.id !== currentUser.value.id,
  )
})

function insertAtCursor(text: string) {
  const el = textareaRef.value
  if (!el) {
    content.value += text
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  content.value = content.value.slice(0, start) + text + content.value.slice(end)
  nextTick(() => {
    el.focus()
    const pos = start + text.length
    el.setSelectionRange(pos, pos)
  })
}

function onInput() {
  const el = textareaRef.value
  if (!el) return

  const pos = el.selectionStart
  const before = content.value.slice(0, pos)
  const atIndex = before.lastIndexOf('@')

  if (atIndex >= 0) {
    const between = before.slice(atIndex + 1)
    if (!/\s/.test(between)) {
      mentionStart.value = atIndex
      mentionKeyword.value = between
      mentionOpen.value = true
      return
    }
  }

  closeMention()
}

function closeMention() {
  mentionOpen.value = false
  mentionKeyword.value = ''
  mentionStart.value = -1
}

function selectMention(name: string) {
  const el = textareaRef.value
  if (!el || mentionStart.value < 0) return

  const before = content.value.slice(0, mentionStart.value)
  const after = content.value.slice(el.selectionStart)
  content.value = `${before}@${name} ${after}`

  closeMention()
  nextTick(() => {
    el.focus()
    const pos = before.length + name.length + 2
    el.setSelectionRange(pos, pos)
  })
}

function appendEmoji(emoji: string) {
  insertAtCursor(emoji)
  emojiOpen.value = false
}

function extractMentions(text: string): string[] {
  const names = users.value.map((u) => u.name)
  const found: string[] = []
  for (const name of names) {
    if (text.includes(`@${name}`)) found.push(name)
  }
  return found
}

function readFileAsUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function onPickAttachment(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  for (const file of Array.from(files)) {
    const url = await readFileAsUrl(file)
    pendingAttachments.value.push({
      id: `att-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      url,
    })
  }
  input.value = ''
}

async function onPickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    const url = await readFileAsUrl(file)
    pendingImages.value.push({
      id: `img-${Date.now()}-${Math.random()}`,
      name: file.name,
      url,
    })
  }
  input.value = ''
}

function removeAttachment(id: string) {
  pendingAttachments.value = pendingAttachments.value.filter((a) => a.id !== id)
}

function removeImage(id: string) {
  pendingImages.value = pendingImages.value.filter((i) => i.id !== id)
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function handleSend() {
  messageStore.sendMessage({
    content: content.value,
    mentions: extractMentions(content.value),
    attachments: [...pendingAttachments.value],
    images: [...pendingImages.value],
    visibility: visibility.value,
  })

  content.value = ''
  pendingAttachments.value = []
  pendingImages.value = []
  closeMention()
  emit('send')
}

function onKeydown(e: KeyboardEvent) {
  if (mentionOpen.value && e.key === 'Escape') {
    closeMention()
    e.preventDefault()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !mentionOpen.value) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer-toolbar">
      <a-popover v-model:open="emojiOpen" trigger="click" placement="topLeft">
        <template #content>
          <div class="emoji-grid">
            <button
              v-for="emoji in emojiList"
              :key="emoji"
              type="button"
              class="emoji-btn"
              @click="appendEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </template>
        <a-tooltip title="表情">
          <a-button type="text" :icon="h(SmileOutlined)" />
        </a-tooltip>
      </a-popover>

      <a-tooltip title="附件">
        <label class="upload-label">
          <a-button type="text" :icon="h(PaperClipOutlined)" />
          <input type="file" multiple hidden @change="onPickAttachment" />
        </label>
      </a-tooltip>

      <a-tooltip title="图片">
        <label class="upload-label">
          <a-button type="text" :icon="h(PictureOutlined)" />
          <input type="file" accept="image/*" multiple hidden @change="onPickImage" />
        </label>
      </a-tooltip>

      <a-dropdown>
        <a-button type="text">
          {{ visibilityLabel }}
          <DownOutlined />
        </a-button>
        <template #overlay>
          <a-menu
            :selected-keys="[visibility]"
            @click="({ key }: { key: string }) => (visibility = key as MessageVisibility)"
          >
            <a-menu-item v-for="opt in visibilityOptions" :key="opt.value">
              {{ opt.label }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>

    <div class="composer-body">
      <a-textarea
        ref="textareaRef"
        v-model:value="content"
        placeholder="输入消息，@ 可提及同事，Shift+Enter 换行"
        :auto-size="{ minRows: 3, maxRows: 6 }"
        @input="onInput"
        @keydown="onKeydown"
        @click="onInput"
      />

      <div v-if="mentionOpen && filteredUsers.length" class="mention-dropdown">
        <div
          v-for="user in filteredUsers"
          :key="user.id"
          class="mention-item"
          @mousedown.prevent="selectMention(user.name)"
        >
          <a-avatar size="small">{{ user.name.slice(0, 1) }}</a-avatar>
          <span>{{ user.name }}</span>
        </div>
      </div>
    </div>

    <div v-if="pendingImages.length" class="preview-row">
      <div v-for="img in pendingImages" :key="img.id" class="preview-image">
        <img :src="img.url" :alt="img.name" />
        <a-button size="small" type="text" danger @click="removeImage(img.id)">×</a-button>
      </div>
    </div>

    <div v-if="pendingAttachments.length" class="preview-attachments">
      <a-tag
        v-for="att in pendingAttachments"
        :key="att.id"
        closable
        @close="removeAttachment(att.id)"
      >
        📎 {{ att.name }} ({{ formatSize(att.size) }})
      </a-tag>
    </div>

    <div class="composer-footer">
      <span class="hint">Enter 发送 · Shift+Enter 换行 · 输入 @ 提及他人</span>
      <a-button type="primary" :icon="h(SendOutlined)" @click="handleSend">发送</a-button>
    </div>
  </div>
</template>

<style scoped>
.composer {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.upload-label {
  cursor: pointer;
  display: inline-flex;
}

.composer-body {
  position: relative;
}

.mention-dropdown {
  position: absolute;
  left: 0;
  bottom: calc(100% + 4px);
  width: 200px;
  max-height: 200px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.mention-item:hover {
  background: #f5f5f5;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  width: 200px;
}

.emoji-btn {
  border: none;
  background: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.emoji-btn:hover {
  background: #f5f5f5;
}

.preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.preview-image {
  position: relative;
  width: 72px;
  height: 72px;
}

.preview-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
}

.preview-image .ant-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.preview-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.hint {
  font-size: 12px;
  color: #999;
}
</style>
