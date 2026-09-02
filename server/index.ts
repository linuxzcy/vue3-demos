import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { createChunkUploadRouter } from './chunkUpload'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

app.use(cors())
app.use(express.json({ limit: '20mb' }))
app.use('/uploads', express.static('uploads'))
app.use('/api/chunk', createChunkUploadRouter())

// ─── 内存存储 ───────────────────────────────────────────────
interface ClientMeta {
  id: string
  name: string
  room: string
  ws: WebSocket
  lastPing: number
}

const clients = new Map<WebSocket, ClientMeta>()
const rooms = new Map<string, Set<WebSocket>>()

// ─── 工具函数 ───────────────────────────────────────────────
function broadcast(room: string, payload: object, exclude?: WebSocket) {
  const set = rooms.get(room)
  if (!set) return
  const msg = JSON.stringify(payload)
  for (const ws of set) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
}

function getOnlineUsers(room: string) {
  const set = rooms.get(room)
  if (!set) return []
  return [...set]
    .map((ws) => clients.get(ws))
    .filter(Boolean)
    .map((c) => ({ id: c!.id, name: c!.name }))
}

function send(ws: WebSocket, type: string, data: unknown = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data, ts: Date.now() }))
  }
}

// ─── WebSocket ───────────────────────────────────────────────
wss.on('connection', (ws) => {
  send(ws, 'connected', { message: 'WebSocket 连接成功，请发送 join 加入房间' })

  ws.on('message', (raw) => {
    let msg: { type: string; data?: Record<string, unknown> }
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(ws, 'error', { message: '消息格式错误，需 JSON' })
      return
    }

    const { type, data = {} } = msg

    switch (type) {
      case 'join': {
        const name = String(data.name || '匿名用户')
        const room = String(data.room || 'default')
        const id = randomUUID().slice(0, 8)

        // 离开旧房间
        const old = clients.get(ws)
        if (old) {
          rooms.get(old.room)?.delete(ws)
          broadcast(old.room, { type: 'user_left', data: { id: old.id, name: old.name } })
          broadcast(old.room, { type: 'online_users', data: getOnlineUsers(old.room) })
        }

        clients.set(ws, { id, name, room, ws, lastPing: Date.now() })
        if (!rooms.has(room)) rooms.set(room, new Set())
        rooms.get(room)!.add(ws)

        send(ws, 'joined', { id, name, room })
        broadcast(room, { type: 'user_joined', data: { id, name } }, ws)
        broadcast(room, { type: 'online_users', data: getOnlineUsers(room) })
        send(ws, 'system', { message: `欢迎 ${name} 加入房间「${room}」` })
        break
      }

      case 'chat': {
        const client = clients.get(ws)
        if (!client) {
          send(ws, 'error', { message: '请先 join 加入房间' })
          return
        }
        broadcast(client.room, {
          type: 'chat',
          data: {
            id: randomUUID().slice(0, 8),
            from: { id: client.id, name: client.name },
            content: String(data.content || ''),
          },
        })
        break
      }

      case 'private': {
        const client = clients.get(ws)
        if (!client) return
        const targetId = String(data.targetId || '')
        const content = String(data.content || '')
        for (const [, c] of clients) {
          if (c.id === targetId && c.room === client.room) {
            send(c.ws, 'private', {
              from: { id: client.id, name: client.name },
              content,
            })
            send(ws, 'private_sent', { to: targetId, content })
            return
          }
        }
        send(ws, 'error', { message: '目标用户不在线' })
        break
      }

      case 'typing': {
        const client = clients.get(ws)
        if (!client) return
        broadcast(
          client.room,
          { type: 'typing', data: { id: client.id, name: client.name, typing: !!data.typing } },
          ws,
        )
        break
      }

      case 'ping': {
        const client = clients.get(ws)
        if (client) client.lastPing = Date.now()
        send(ws, 'pong', { serverTime: Date.now() })
        break
      }

      default:
        send(ws, 'error', { message: `未知消息类型: ${type}` })
    }
  })

  ws.on('close', () => {
    const client = clients.get(ws)
    if (client) {
      rooms.get(client.room)?.delete(ws)
      broadcast(client.room, { type: 'user_left', data: { id: client.id, name: client.name } })
      broadcast(client.room, { type: 'online_users', data: getOnlineUsers(client.room) })
      clients.delete(ws)
    }
  })
})

// 心跳检测：30s 无 ping 则断开
setInterval(() => {
  const now = Date.now()
  for (const [ws, client] of clients) {
    if (now - client.lastPing > 60000) {
      ws.terminate()
      clients.delete(ws)
    }
  }
}, 15000)

// ─── SSE 流式输出 ────────────────────────────────────────────
const sseDemoResponses: Record<string, string> = {
  math: `# 数学公式演示（KaTeX）

二次方程求根公式：

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

欧拉公式（数学中最美的公式之一）：

$$e^{i\\pi} + 1 = 0$$

行内公式：勾股定理 $a^2 + b^2 = c^2$，以及 $E = mc^2$。

积分示例：

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$

高斯分布：

$$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$$

> 以上公式使用 LaTeX + KaTeX 渲染`,

  markdown: `# ChatGPT 风格流式输出

这是一段 **Markdown** 演示，支持：

- 有序/无序列表
- \`行内代码\`
- 引用块

\`\`\`javascript
function fib(n) {
  return n <= 1 ? n : fib(n - 1) + fib(n - 2)
}
console.log(fib(10)) // 55
\`\`\`

![示例图片](https://picsum.photos/400/200)

| 功能 | 支持 |
|------|------|
| SSE | ✅ |
| Markdown | ✅ |
| 数学公式 | ✅ |
| Mermaid | ✅ |`,

  mermaid: `# Mermaid 流程图演示

SSE 流式对话处理流程：

\`\`\`mermaid
flowchart TD
  A[用户发送消息] --> B[服务端 SSE 推送]
  B --> C{文本类型?}
  C -->|Markdown| D[marked 解析]
  C -->|数学公式| E[KaTeX 渲染]
  C -->|流程图| F[Mermaid 渲染]
  D --> G[DOMPurify 清洗]
  E --> G
  F --> G
  G --> H[v-html 展示]
\`\`\`

时序图：

\`\`\`mermaid
sequenceDiagram
  participant U as 用户
  participant F as 前端
  participant S as 服务端
  U->>F: 点击发送
  F->>S: EventSource 连接
  S-->>F: data chunk...
  F->>F: renderMarkdown
  F-->>U: 实时更新 UI
\`\`\`
`,

  mixed: `# 综合演示：AI 助手回复

## 1. 文本说明

SSE（Server-Sent Events）适合 **单向流式推送**，典型场景：

1. ChatGPT / Copilot 对话流
2. 实时日志 tail
3. 股票/行情推送

## 2. 数学推导

高斯分布概率密度函数：

$$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$$

## 3. Mermaid 流程

\`\`\`mermaid
flowchart LR
  A[请求] --> B[SSE 流]
  B --> C[前端渲染]
  C --> D[用户可见]
\`\`\`

## 4. 代码示例

\`\`\`python
import sseclient  # pip install sseclient-py

for event in sseclient.SSEClient(url):
    print(event.data, end='', flush=True)
\`\`\`

## 5. 结论

流式输出能显著降低 **首字延迟（TTFT）**，提升用户体验。`,
}

app.get('/api/sse/stream', (req, res) => {
  const topic = String(req.query.topic || 'mixed')
  const content = sseDemoResponses[topic] ?? sseDemoResponses.mixed

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  let i = 0
  const chunkSize = 3
  const interval = setInterval(() => {
    if (i >= content.length) {
      res.write(`event: done\ndata: [DONE]\n\n`)
      clearInterval(interval)
      res.end()
      return
    }
    const chunk = content.slice(i, i + chunkSize)
    i += chunkSize
    res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
  }, 40)

  req.on('close', () => clearInterval(interval))
})

// ─── 文件上传（TinyMCE / 通用） ─────────────────────────────
app.post('/api/upload', (req, res) => {
  const { file, filename } = req.body as { file?: string; filename?: string }
  if (!file) {
    res.status(400).json({ error: '缺少 file 字段（base64）' })
    return
  }

  const match = file.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    res.status(400).json({ error: 'file 需为 data URL base64 格式' })
    return
  }

  const mime = match[1]
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
  const name = filename || `upload-${Date.now()}.${ext}`
  const url = file // demo 直接返回 base64 URL，生产环境应存 OSS

  res.json({ location: url, url, name, mime })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, wsClients: clients.size, rooms: [...rooms.keys()] })
})

const PORT = 3001
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ws`)
})
