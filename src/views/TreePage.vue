<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useTreeStore } from '../stores/treeStore'
const treeStore = useTreeStore()
const { treeData, checkedKeysModel, selectedCodesList, checkKeys } =
  storeToRefs(treeStore)

const newChildTitle = ref('')
const addParentCode = ref('dept-1')

function onCheck(
  _checkedKeys: unknown,
  e: { checked: boolean; node: { code: string } },
) {
  treeStore.handleCheck(e.checked, e.node.code)
}

function onDrop(info: Parameters<typeof treeStore.handleDrop>[0]) {
  treeStore.handleDrop(info)
}

function handleAddChild() {
  const title = newChildTitle.value.trim()
  if (!title) return
  treeStore.handleAddChild(addParentCode.value, title)
  newChildTitle.value = ''
}
</script>

<template>
  <div class="tree-page">
    <a-card title="树形勾选（父子联动 + 半选）" :bordered="false">
      <a-space wrap class="toolbar">
        <a-button type="primary" @click="treeStore.handleSelectAll">全选</a-button>
        <a-button @click="treeStore.handleInvert">反选</a-button>
        <a-divider type="vertical" />
        <a-select
          v-model:value="addParentCode"
          style="width: 160px"
          :options="
            treeStore.allCodes.map((c) => ({ label: c, value: c }))
          "
        />
        <a-input
          v-model:value="newChildTitle"
          placeholder="新子节点名称"
          style="width: 160px"
          @press-enter="handleAddChild"
        />
        <a-button type="dashed" @click="handleAddChild">动态添加子节点</a-button>
      </a-space>

      <a-alert
        class="hint"
        type="info"
        show-icon
        message="勾选说明"
        description="父节点勾选会联动所有现有子节点；动态新增子节点不会自动选中（父节点变为半选）。仅勾选部分子节点时，父节点自动半选；子节点全选时父节点自动选中。"
      />

      <div class="tree-layout">
        <div class="tree-panel">
          <h3>组织架构树（可拖拽排序）</h3>
          <a-tree
            checkable
            draggable
            block-node
            :tree-data="treeData"
            :field-names="{ key: 'code', title: 'title', children: 'children' }"
            :checked-keys="checkedKeysModel"
            check-strictly
            @check="onCheck"
            @drop="onDrop"
          />
        </div>

        <div class="side-panel">
          <h3>勾选状态</h3>
          <p>
            <strong>全选：</strong>
            <a-tag v-for="c in checkKeys.checked" :key="c" color="blue">{{ c }}</a-tag>
            <a-tag v-if="!checkKeys.checked.length" color="default">无</a-tag>
          </p>
          <p>
            <strong>半选：</strong>
            <a-tag v-for="c in checkKeys.halfChecked" :key="c" color="orange">{{ c }}</a-tag>
            <a-tag v-if="!checkKeys.halfChecked.length" color="default">无</a-tag>
          </p>
          <p>
            <strong>checkedCodes（数据层）：</strong>
          </p>
          <a-tag v-for="c in selectedCodesList" :key="c">{{ c }}</a-tag>

          <h3 class="drag-demo-title">拖拽列表示例（vue-draggable-plus）</h3>
          <VueDraggable
            v-model="treeData"
            :animation="200"
            handle=".drag-handle"
            class="drag-list"
          >
            <div v-for="item in treeData" :key="item.code" class="drag-item">
              <span class="drag-handle">⠿</span>
              {{ item.title }} ({{ item.code }})
            </div>
          </VueDraggable>
        </div>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.tree-page {
  padding: 24px;
  min-height: 100vh;
  background: #f5f5f5;
}

.toolbar {
  margin-bottom: 16px;
}

.hint {
  margin-bottom: 20px;
}

.tree-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.tree-panel,
.side-panel {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 16px;
}

h3 {
  margin: 0 0 12px;
  font-size: 15px;
}

.side-panel p {
  margin: 0 0 12px;
}

.drag-demo-title {
  margin-top: 24px;
}

.drag-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  cursor: default;
}

.drag-handle {
  cursor: grab;
  color: #999;
  user-select: none;
}

@media (max-width: 900px) {
  .tree-layout {
    grid-template-columns: 1fr;
  }
}
</style>
