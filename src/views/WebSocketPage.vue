<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  ApiOutlined,
  DisconnectOutlined,
  SendOutlined,
  UserOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import { useWebSocketStore } from '../stores/wsStore'

const wsStore = useWebSocketStore()
const {
  connected,
  connecting,
  latency,
  messages,
  onlineUsers,
  typingUsers,
  myId,
  room,
  userName,
} = storeToRefs(wsStore)

const input = ref('')
const privateTarget = ref<string | undefined>(undefined)
const chatMode = ref<'room' | 'private'>('room')
let typingTimer: ReturnType<typeof setTimeout> | null = null

const scenarios = [
  { title: '即时通讯', desc: '聊天室、客服对话、协作白板光标同步' },
  { title: '实时通知', desc: '订单状态、审批流、系统告警推送' },
  { title: '在线协作', desc: '多人编辑、游戏状态、直播弹幕' },
  { title: 'IoT 监控', desc: '传感器数据、设备状态双向控制' },
  { title: '金融行情', desc: '股票/加密货币实时报价、深度图' },
  { title: '心跳保活', desc: '检测断线、自动重连、延迟监测' },
]

const filteredMessages = computed(() =>
  chatMode.value === 'room'
    ? messages.value.filter((m) => m.kind === 'room' || m.kind === 'system')
    : messages.value.filter((m) => m.kind === 'private'),
)

function handleConnect() {
  wsStore.connect()
}

function handleDisconnect() {
  wsStore.disconnect()
}

function handleJoin() {
  wsStore.join()
}

function onInput() {
  wsStore.sendTyping(true)
  if (typingTimer) clearTimeout(typingTimer)
  typingTimer = setTimeout(() => wsStore.sendTyping(false), 1500)
}

function handleSend() {
  const text = input.value.trim()
  if (!text) return
  if (chatMode.value === 'private' && privateTarget.value) {
    wsStore.sendPrivate(privateTarget.value, text)
  } else {
    wsStore.sendChat(text)
  }
  input.value = ''
  wsStore.sendTyping(false)
}

onUnmounted(() => {
  if (typingTimer) clearTimeout(typingTimer)
})
</script>

<template>
  <div class="ws-page">
    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :lg="8">
        <a-card title="WebSocket 应用场景" size="small">
          <a-list size="small" :data-source="scenarios">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta :title="item.title" :description="item.desc" />
              </a-list-item>
            </template>
          </a-list>
        </a-card>

        <a-card title="连接配置" size="small" class="mt-card">
          <a-form layout="vertical">
            <a-form-item label="用户名">
              <a-input v-model:value="userName" :disabled="connected" />
            </a-form-item>
            <a-form-item label="房间">
              <a-input v-model:value="room" :disabled="connected" />
            </a-form-item>
          </a-form>
          <a-space wrap>
            <a-button
              type="primary"
              :loading="connecting"
              :disabled="connected"
              @click="handleConnect"
            >
              <ApiOutlined /> 连接
            </a-button>
            <a-button danger :disabled="!connected" @click="handleDisconnect">
              <DisconnectOutlined /> 断开
            </a-button>
            <a-button :disabled="!connected" @click="handleJoin">
              <ReloadOutlined /> 重新加入
            </a-button>
          </a-space>
          <div class="status-bar">
            <a-badge :status="connected ? 'success' : 'default'" />
            {{ connected ? '已连接' : '未连接' }}
            <span v-if="latency >= 0" class="latency">延迟: {{ latency }}ms</span>
            <span v-if="myId" class="my-id">ID: {{ myId }}</span>
          </div>
        </a-card>

        <a-card title="在线用户" size="small" class="mt-card">
          <a-empty v-if="!onlineUsers.length" description="暂无在线用户" />
          <a-tag v-for="u in onlineUsers" :key="u.id" :color="u.id === myId ? 'blue' : 'default'">
            <UserOutlined /> {{ u.name }}
          </a-tag>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="16">
        <a-card title="实时消息" size="small">
          <a-radio-group v-model:value="chatMode" style="margin-bottom: 12px">
            <a-radio-button value="room">房间广播</a-radio-button>
            <a-radio-button value="private">私聊</a-radio-button>
          </a-radio-group>

          <a-select
            v-if="chatMode === 'private'"
            v-model:value="privateTarget"
            placeholder="选择私聊对象"
            style="width: 200px; margin-bottom: 12px; display: block"
            :options="onlineUsers.filter((u) => u.id !== myId).map((u) => ({ label: u.name, value: u.id }))"
          />

          <div class="msg-list">
            <div
              v-for="msg in filteredMessages"
              :key="msg.id"
              :class="['msg-item', msg.kind]"
            >
              <span class="msg-time">{{ msg.time }}</span>
              <span v-if="msg.from" class="msg-from">{{ msg.from.name }}:</span>
              <span v-else-if="msg.kind === 'system'" class="msg-system">[系统]</span>
              <span class="msg-content">{{ msg.content }}</span>
            </div>
            <a-empty v-if="!filteredMessages.length" description="暂无消息" />
          </div>

          <div v-if="typingUsers.length" class="typing-hint">
            {{ typingUsers.map((u) => u.name).join('、') }} 正在输入...
          </div>

          <a-input-group compact class="send-bar">
            <a-input
              v-model:value="input"
              placeholder="输入消息，Enter 发送"
              :disabled="!connected"
              @input="onInput"
              @press-enter="handleSend"
            />
            <a-button type="primary" :disabled="!connected" @click="handleSend">
              <SendOutlined />
            </a-button>
          </a-input-group>
        </a-card>

        <a-card title="支持的功能" size="small" class="mt-card">
          <a-descriptions :column="2" size="small" bordered>
            <a-descriptions-item label="双向通信">客户端 ↔ 服务端实时互发 JSON 消息</a-descriptions-item>
            <a-descriptions-item label="房间广播">同房间所有人收到 chat 消息</a-descriptions-item>
            <a-descriptions-item label="私聊">点对点 private 消息</a-descriptions-item>
            <a-descriptions-item label="输入状态">typing 事件实时同步</a-descriptions-item>
            <a-descriptions-item label="在线列表">加入/离开自动广播 online_users</a-descriptions-item>
            <a-descriptions-item label="心跳检测">ping/pong + 服务端超时踢出</a-descriptions-item>
            <a-descriptions-item label="自动重连">断线后指数退避重连（最多 5 次）</a-descriptions-item>
            <a-descriptions-item label="系统通知">join/leave/system 事件</a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.ws-page {
  padding: 16px 0;
}

.mt-card {
  margin-top: 16px;
}

.status-bar {
  margin-top: 12px;
  font-size: 13px;
  color: #666;
}

.latency,
.my-id {
  margin-left: 12px;
}

.msg-list {
  height: 360px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  background: #fafafa;
}

.msg-item {
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.msg-item.system {
  color: #999;
  font-style: italic;
}

.msg-item.private {
  color: #722ed1;
}

.msg-time {
  color: #bbb;
  margin-right: 8px;
  font-size: 11px;
}

.msg-from {
  font-weight: 600;
  margin-right: 4px;
}

.typing-hint {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.send-bar {
  display: flex;
}
</style>
