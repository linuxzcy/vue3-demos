import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ChatMessage,
  ChatUser,
  MessageAttachment,
  MessageImage,
  MessageVisibility,
} from '../types/message'

const mockUsers: ChatUser[] = [
  { id: 'u1', name: '张三' },
  { id: 'u2', name: '李四' },
  { id: 'u3', name: '王五' },
  { id: 'u4', name: '赵六' },
  { id: 'u5', name: '陈七' },
]

export const useMessageStore = defineStore('message', () => {
  const users = ref<ChatUser[]>(mockUsers)
  const messages = ref<ChatMessage[]>([
    {
      id: 'm1',
      content: '大家好，今天的需求评审 @李四 记得参加。',
      senderId: 'u1',
      senderName: '张三',
      createdAt: '2026-08-27T09:30:00',
      mentions: ['李四'],
      attachments: [],
      images: [],
      visibility: 'public',
    },
    {
      id: 'm2',
      content: '收到，我会准时到。',
      senderId: 'u2',
      senderName: '李四',
      createdAt: '2026-08-27T09:32:00',
      mentions: [],
      attachments: [],
      images: [],
      visibility: 'public',
    },
  ])

  const currentUser = ref<ChatUser>(mockUsers[0])

  function sendMessage(payload: {
    content: string
    mentions: string[]
    attachments: MessageAttachment[]
    images: MessageImage[]
    visibility: MessageVisibility
  }) {
    const trimmed = payload.content.trim()
    if (!trimmed && !payload.attachments.length && !payload.images.length) return

    messages.value.push({
      id: `m-${Date.now()}`,
      content: trimmed,
      senderId: currentUser.value.id,
      senderName: currentUser.value.name,
      createdAt: new Date().toISOString(),
      mentions: payload.mentions,
      attachments: payload.attachments,
      images: payload.images,
      visibility: payload.visibility,
    })
  }

  return {
    users,
    messages,
    currentUser,
    sendMessage,
  }
})
