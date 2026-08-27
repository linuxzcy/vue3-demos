export interface ChatUser {
  id: string
  name: string
  avatar?: string
}

export interface MessageAttachment {
  id: string
  name: string
  size: number
  url: string
}

export interface MessageImage {
  id: string
  name: string
  url: string
}

export interface ChatMessage {
  id: string
  content: string
  senderId: string
  senderName: string
  createdAt: string
  mentions: string[]
  attachments: MessageAttachment[]
  images: MessageImage[]
  visibility: 'public' | 'team' | 'private'
}

export type MessageVisibility = ChatMessage['visibility']
