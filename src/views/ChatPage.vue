<script setup lang="ts">
import { storeToRefs } from 'pinia'
import MessageComposer from '../components/MessageComposer.vue'
import MessageTimeline from '../components/MessageTimeline.vue'
import { useMessageStore } from '../stores/messageStore'

const messageStore = useMessageStore()
const { currentUser, users } = storeToRefs(messageStore)

function switchUser(id: string) {
  const u = users.value.find((x) => x.id === id)
  if (u) currentUser.value = u
}
</script>

<template>
  <div class="chat-page">
    <a-card title="消息发送与时间线" :bordered="false">
      <div class="chat-header">
        <span>当前用户：</span>
        <a-select
          :value="currentUser.id"
          style="width: 140px"
          :options="users.map((u) => ({ label: u.name, value: u.id }))"
          @change="switchUser"
        />
      </div>

      <MessageComposer class="composer-block" />

      <MessageTimeline class="timeline-block" />
    </a-card>
  </div>
</template>

<style scoped>
.chat-page {
  padding: 24px;
  min-height: 100vh;
  background: #f5f5f5;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.composer-block {
  margin-bottom: 24px;
}

.timeline-block {
  margin-top: 8px;
}
</style>
