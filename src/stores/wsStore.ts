import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface WsMessage {
  id: string
  kind: 'room' | 'private' | 'system'
  content: string
  from?: { id: string; name: string }
  time: string
}

export interface OnlineUser {
  id: string
  name: string
}

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export const useWebSocketStore = defineStore('websocket', () => {
  const connected = ref(false)
  const connecting = ref(false)
  const latency = ref(-1)
  const messages = ref<WsMessage[]>([])
  const onlineUsers = ref<OnlineUser[]>([])
  const typingUsers = ref<OnlineUser[]>([])
  const myId = ref('')
  const userName = ref(`用户${Math.floor(Math.random() * 1000)}`)
  const room = ref('demo-room')

  let ws: WebSocket | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let lastPingSent = 0
  let manualClose = false

  function formatTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }

  function addMessage(msg: Omit<WsMessage, 'id' | 'time'>) {
    messages.value.push({
      ...msg,
      id: `${Date.now()}-${Math.random()}`,
      time: formatTime(),
    })
  }

  function send(type: string, data: Record<string, unknown> = {}) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }))
    }
  }

  function join() {
    send('join', { name: userName.value, room: room.value })
  }

  function sendChat(content: string) {
    send('chat', { content })
  }

  function sendPrivate(targetId: string, content: string) {
    send('private', { targetId, content })
    addMessage({
      kind: 'private',
      content: `[发给 ${onlineUsers.value.find((u) => u.id === targetId)?.name}] ${content}`,
      from: { id: myId.value, name: userName.value },
    })
  }

  function sendTyping(typing: boolean) {
    send('typing', { typing })
  }

  function startPing() {
    stopPing()
    pingTimer = setInterval(() => {
      lastPingSent = Date.now()
      send('ping')
    }, 10000)
  }

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function handleMessage(raw: MessageEvent) {
    let msg: { type: string; data: Record<string, unknown> }
    try {
      msg = JSON.parse(raw.data as string)
    } catch {
      return
    }

    switch (msg.type) {
      case 'joined':
        myId.value = msg.data.id as string
        addMessage({ kind: 'system', content: `已加入房间，你的 ID: ${myId.value}` })
        reconnectAttempts = 0
        break
      case 'chat':
        addMessage({
          kind: 'room',
          content: msg.data.content as string,
          from: msg.data.from as { id: string; name: string },
        })
        break
      case 'private':
        addMessage({
          kind: 'private',
          content: msg.data.content as string,
          from: msg.data.from as { id: string; name: string },
        })
        break
      case 'system':
        addMessage({ kind: 'system', content: msg.data.message as string })
        break
      case 'online_users':
        onlineUsers.value = msg.data as unknown as OnlineUser[]
        break
      case 'typing': {
        const { id, name, typing } = msg.data as {
          id: string
          name: string
          typing: boolean
        }
        if (typing) {
          if (!typingUsers.value.find((u) => u.id === id)) {
            typingUsers.value.push({ id, name })
          }
        } else {
          typingUsers.value = typingUsers.value.filter((u) => u.id !== id)
        }
        break
      }
      case 'user_joined':
        addMessage({
          kind: 'system',
          content: `${(msg.data as { name: string }).name} 加入了房间`,
        })
        break
      case 'user_left':
        addMessage({
          kind: 'system',
          content: `${(msg.data as { name: string }).name} 离开了房间`,
        })
        break
      case 'pong':
        latency.value = Date.now() - lastPingSent
        break
      case 'connected':
        addMessage({ kind: 'system', content: msg.data.message as string })
        break
      case 'error':
        addMessage({ kind: 'system', content: `错误: ${msg.data.message}` })
        break
    }
  }

  function scheduleReconnect() {
    if (manualClose || reconnectAttempts >= 5) return
    reconnectAttempts++
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 16000)
    reconnectTimer = setTimeout(() => connect(), delay)
    addMessage({
      kind: 'system',
      content: `${delay / 1000}s 后尝试第 ${reconnectAttempts} 次重连...`,
    })
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return
    manualClose = false
    connecting.value = true

    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      connected.value = true
      connecting.value = false
      startPing()
      join()
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      connected.value = false
      connecting.value = false
      stopPing()
      if (!manualClose) scheduleReconnect()
    }

    ws.onerror = () => {
      connecting.value = false
    }
  }

  function disconnect() {
    manualClose = true
    reconnectAttempts = 5
    if (reconnectTimer) clearTimeout(reconnectTimer)
    stopPing()
    ws?.close()
    ws = null
    connected.value = false
    myId.value = ''
    onlineUsers.value = []
    typingUsers.value = []
  }

  return {
    connected,
    connecting,
    latency,
    messages,
    onlineUsers,
    typingUsers,
    myId,
    userName,
    room,
    connect,
    disconnect,
    join,
    sendChat,
    sendPrivate,
    sendTyping,
  }
})
