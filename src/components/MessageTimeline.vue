<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMessageStore } from '../stores/messageStore'
import type { ChatMessage } from '../types/message'

const messageStore = useMessageStore()
const { messages } = storeToRefs(messageStore)

const sortedMessages = computed(() =>
  [...messages.value].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  ),
)

const visibilityMap: Record<ChatMessage['visibility'], string> = {
  public: '公开',
  team: '团队',
  private: '私密',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function renderContent(msg: ChatMessage) {
  if (!msg.content) return []
  const parts: { type: 'text' | 'mention'; value: string }[] = []
  let remaining = msg.content

  while (remaining.length) {
    let earliestIdx = -1
    let earliestName = ''

    for (const name of msg.mentions) {
      const token = `@${name}`
      const idx = remaining.indexOf(token)
      if (idx >= 0 && (earliestIdx < 0 || idx < earliestIdx)) {
        earliestIdx = idx
        earliestName = name
      }
    }

    if (earliestIdx < 0) {
      parts.push({ type: 'text', value: remaining })
      break
    }

    if (earliestIdx > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, earliestIdx) })
    }

    parts.push({ type: 'mention', value: earliestName })
    remaining = remaining.slice(earliestIdx + earliestName.length + 1)
  }

  return parts
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="timeline-wrap">
    <h3 class="timeline-title">消息时间线</h3>

    <a-empty v-if="!sortedMessages.length" description="暂无消息，发送第一条吧" />

    <a-timeline v-else mode="left">
      <a-timeline-item
        v-for="msg in sortedMessages"
        :key="msg.id"
        :color="msg.mentions.length ? 'blue' : 'gray'"
      >
        <template #label>
          <div class="time-label">{{ formatTime(msg.createdAt) }}</div>
        </template>

        <div class="msg-card">
          <div class="msg-header">
            <a-avatar size="small" class="avatar">{{ msg.senderName.slice(0, 1) }}</a-avatar>
            <span class="sender">{{ msg.senderName }}</span>
            <a-tag size="small">{{ visibilityMap[msg.visibility] }}</a-tag>
          </div>

          <div v-if="msg.content" class="msg-content">
            <template v-for="(part, i) in renderContent(msg)" :key="i">
              <span v-if="part.type === 'text'">{{ part.value }}</span>
              <a-tag v-else color="blue" class="mention-tag">@{{ part.value }}</a-tag>
            </template>
          </div>

          <div v-if="msg.images.length" class="msg-images">
            <a-image-preview-group>
              <a-image
                v-for="img in msg.images"
                :key="img.id"
                :src="img.url"
                :alt="img.name"
                :width="120"
                :height="120"
                class="msg-image"
              />
            </a-image-preview-group>
          </div>

          <div v-if="msg.attachments.length" class="msg-attachments">
            <a
              v-for="att in msg.attachments"
              :key="att.id"
              :href="att.url"
              :download="att.name"
              class="attachment-link"
            >
              📎 {{ att.name }} ({{ formatSize(att.size) }})
            </a>
          </div>
        </div>
      </a-timeline-item>
    </a-timeline>
  </div>
</template>

<style scoped>
.timeline-wrap {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 16px;
  min-height: 300px;
}

.timeline-title {
  margin: 0 0 16px;
  font-size: 15px;
}

.time-label {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  min-width: 140px;
}

.msg-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.sender {
  font-weight: 600;
  color: #333;
}

.msg-content {
  line-height: 1.6;
  color: #444;
  word-break: break-word;
}

.mention-tag {
  margin: 0 2px;
}

.msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.msg-image {
  object-fit: cover;
  border-radius: 6px;
}

.msg-attachments {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.attachment-link {
  color: #1677ff;
  font-size: 13px;
}

.attachment-link:hover {
  text-decoration: underline;
}
</style>
