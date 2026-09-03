<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import LogicFlow from '@logicflow/core'
import {
  Control,
  Menu,
  MiniMap,
  SelectionSelect,
  Snapshot,
} from '@logicflow/extension'
import '@logicflow/core/es/index.css'
import '@logicflow/extension/es/index.css'

type ElementKind = 'node' | 'edge' | null

interface PaletteItem {
  type: string
  text: string
  label: string
  color: string
}

const containerRef = ref<HTMLElement | null>(null)
let lf: LogicFlow | null = null

const selected = reactive({
  kind: null as ElementKind,
  id: '',
  type: '',
  text: '',
  properties: {} as Record<string, string>,
})

const graphJson = ref('')
const showJson = ref(false)

const palette: PaletteItem[] = [
  { type: 'circle', text: '开始', label: '开始', color: '#52c41a' },
  { type: 'rect', text: '审批节点', label: '审批', color: '#1677ff' },
  { type: 'rect', text: '办理节点', label: '办理', color: '#13c2c2' },
  { type: 'diamond', text: '条件网关', label: '网关', color: '#fa8c16' },
  { type: 'circle', text: '结束', label: '结束', color: '#ff4d4f' },
]

const edgeTypes = [
  { value: 'polyline', label: '折线' },
  { value: 'bezier', label: '贝塞尔' },
  { value: 'line', label: '直线' },
]

const edgeType = ref('polyline')

const hasSelection = computed(() => !!selected.id)

const defaultData = {
  nodes: [
    {
      id: 'start',
      type: 'circle',
      x: 160,
      y: 220,
      text: '开始',
      properties: { nodeKind: 'start' },
    },
    {
      id: 'task1',
      type: 'rect',
      x: 360,
      y: 220,
      text: '提交申请',
      properties: { nodeKind: 'task', assignee: '发起人', role: '员工' },
    },
    {
      id: 'gateway',
      type: 'diamond',
      x: 580,
      y: 220,
      text: '经理审批',
      properties: { nodeKind: 'gateway', condition: '金额 > 1000' },
    },
    {
      id: 'task2',
      type: 'rect',
      x: 800,
      y: 120,
      text: '财务复核',
      properties: { nodeKind: 'task', assignee: '财务', role: '财务' },
    },
    {
      id: 'task3',
      type: 'rect',
      x: 800,
      y: 320,
      text: '直接通过',
      properties: { nodeKind: 'task', assignee: '系统', role: '-' },
    },
    {
      id: 'end',
      type: 'circle',
      x: 1020,
      y: 220,
      text: '结束',
      properties: { nodeKind: 'end' },
    },
  ],
  edges: [
    { id: 'e1', type: 'polyline', sourceNodeId: 'start', targetNodeId: 'task1' },
    { id: 'e2', type: 'polyline', sourceNodeId: 'task1', targetNodeId: 'gateway' },
    {
      id: 'e3',
      type: 'polyline',
      sourceNodeId: 'gateway',
      targetNodeId: 'task2',
      text: '是',
    },
    {
      id: 'e4',
      type: 'polyline',
      sourceNodeId: 'gateway',
      targetNodeId: 'task3',
      text: '否',
    },
    { id: 'e5', type: 'polyline', sourceNodeId: 'task2', targetNodeId: 'end' },
    { id: 'e6', type: 'polyline', sourceNodeId: 'task3', targetNodeId: 'end' },
  ],
}

function clearSelection() {
  selected.kind = null
  selected.id = ''
  selected.type = ''
  selected.text = ''
  selected.properties = {}
}

function fillNodeSelection(data: any) {
  selected.kind = 'node'
  selected.id = data.id
  selected.type = data.type
  selected.text = typeof data.text === 'object' ? data.text?.value || '' : data.text || ''
  selected.properties = { ...(data.properties || {}) }
}

function fillEdgeSelection(data: any) {
  selected.kind = 'edge'
  selected.id = data.id
  selected.type = data.type
  selected.text = typeof data.text === 'object' ? data.text?.value || '' : data.text || ''
  selected.properties = { ...(data.properties || {}) }
}

function startDrag(item: PaletteItem) {
  if (!lf) return
  lf.dnd.startDrag({
    type: item.type,
    text: item.text,
    properties: {
      nodeKind:
        item.label === '开始'
          ? 'start'
          : item.label === '结束'
            ? 'end'
            : item.label === '网关'
              ? 'gateway'
              : 'task',
      assignee: '',
      role: '',
      condition: '',
    },
  })
}

function applyText() {
  if (!lf || !selected.id) return
  lf.updateText(selected.id, selected.text)
}

function applyProperties() {
  if (!lf || !selected.id || selected.kind !== 'node') return
  lf.setProperties(selected.id, { ...selected.properties })
}

function deleteSelected() {
  if (!lf || !selected.id) return
  if (selected.kind === 'node') lf.deleteNode(selected.id)
  if (selected.kind === 'edge') lf.deleteEdge(selected.id)
  clearSelection()
}

function changeEdgeType(type: string) {
  edgeType.value = type
  lf?.setDefaultEdgeType(type)
}

function zoomIn() {
  lf?.zoom(true)
}
function zoomOut() {
  lf?.zoom(false)
}
function fitView() {
  lf?.fitView(20)
}
function resetZoom() {
  lf?.resetZoom()
  lf?.translateCenter()
}
function undo() {
  lf?.undo()
}
function redo() {
  lf?.redo()
}

function exportJson() {
  if (!lf) return
  const data = lf.getGraphData()
  graphJson.value = JSON.stringify(data, null, 2)
  showJson.value = true
}

function downloadJson() {
  if (!lf) return
  const data = lf.getGraphData()
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `workflow-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function snapshotPng() {
  if (!lf) return
  // Snapshot 插件
  const anyLf = lf as any
  if (anyLf.getSnapshot) {
    await anyLf.getSnapshot()
  } else if (anyLf.extension?.snapshot?.getSnapshot) {
    await anyLf.extension.snapshot.getSnapshot()
  }
}

function resetDemo() {
  if (!lf) return
  lf.render(defaultData as any)
  clearSelection()
  nextTick(() => lf?.fitView(40))
}

function initLogicFlow() {
  if (!containerRef.value) return

  lf = new LogicFlow({
    container: containerRef.value,
    grid: {
      size: 20,
      visible: true,
      type: 'dot',
      config: { color: '#e8e8e8', thickness: 1 },
    },
    background: { backgroundColor: '#fafbfc' },
    keyboard: { enabled: true },
    edgeType: edgeType.value,
    style: {
      rect: {
        rx: 6,
        ry: 6,
        strokeWidth: 2,
        stroke: '#1677ff',
        fill: '#e6f4ff',
      },
      circle: {
        strokeWidth: 2,
        stroke: '#52c41a',
        fill: '#f6ffed',
        r: 28,
      },
      diamond: {
        strokeWidth: 2,
        stroke: '#fa8c16',
        fill: '#fff7e6',
      },
      polyline: {
        strokeWidth: 2,
        stroke: '#8c8c8c',
      },
      nodeText: {
        fontSize: 13,
        color: '#262626',
      },
      edgeText: {
        fontSize: 12,
        color: '#595959',
        background: { fill: '#fff' },
      },
    },
    plugins: [Control, Menu, Snapshot, SelectionSelect, MiniMap],
    pluginsOptions: {
      miniMap: {
        isShowHeader: false,
        isShowCloseIcon: true,
        width: 160,
        height: 110,
      },
    },
  })

  lf.setDefaultEdgeType(edgeType.value)

  // 右键菜单增强
  const menu = (lf.extension as any).menu
  menu?.setMenuConfig?.({
    nodeMenu: [
      {
        text: '删除节点',
        callback(node: any) {
          lf?.deleteNode(node.id)
          clearSelection()
        },
      },
      {
        text: '复制节点',
        callback(node: any) {
          lf?.cloneNode(node.id)
        },
      },
    ],
    edgeMenu: [
      {
        text: '删除连线',
        callback(edge: any) {
          lf?.deleteEdge(edge.id)
          clearSelection()
        },
      },
    ],
    graphMenu: [
      {
        text: '适应画布',
        callback() {
          lf?.fitView(40)
        },
      },
    ],
  })

  lf.on('node:click', ({ data }) => fillNodeSelection(data))
  lf.on('edge:click', ({ data }) => fillEdgeSelection(data))
  lf.on('blank:click', () => clearSelection())
  lf.on('node:dnd-add', ({ data }) => fillNodeSelection(data))

  lf.render(defaultData as any)
  nextTick(() => {
    lf?.fitView(40)
    try {
      ;(lf as any).extension?.miniMap?.show?.(true)
    } catch {
      // miniMap 可选
    }
  })
}

onMounted(initLogicFlow)

onBeforeUnmount(() => {
  try {
    ;(lf as any)?.destroy?.()
  } catch {
    // ignore
  }
  lf = null
})
</script>

<template>
  <div class="lf-page">
    <div class="toolbar">
      <div class="title">
        <strong>LogicFlow 工作流</strong>
        <span>拖拽节点 · 连线 · 属性编辑 · 导出 JSON</span>
      </div>
      <div class="actions">
        <button type="button" @click="undo">撤销</button>
        <button type="button" @click="redo">重做</button>
        <button type="button" @click="zoomIn">放大</button>
        <button type="button" @click="zoomOut">缩小</button>
        <button type="button" @click="fitView">适应</button>
        <button type="button" @click="resetZoom">居中</button>
        <button type="button" @click="exportJson">查看 JSON</button>
        <button type="button" @click="downloadJson">下载 JSON</button>
        <button type="button" @click="snapshotPng">导出图片</button>
        <button type="button" class="primary" @click="resetDemo">重置示例</button>
      </div>
    </div>

    <div class="main">
      <aside class="palette">
        <div class="caption">节点面板</div>
        <div
          v-for="item in palette"
          :key="item.label + item.text"
          class="palette-item"
          :style="{ borderColor: item.color }"
          @mousedown="startDrag(item)"
        >
          <i :style="{ background: item.color }" />
          <div>
            <div class="name">{{ item.label }}</div>
            <div class="desc">{{ item.text }}</div>
          </div>
        </div>

        <div class="caption" style="margin-top: 16px">连线类型</div>
        <div class="edge-types">
          <button
            v-for="et in edgeTypes"
            :key="et.value"
            type="button"
            :class="{ active: edgeType === et.value }"
            @click="changeEdgeType(et.value)"
          >
            {{ et.label }}
          </button>
        </div>

        <p class="tip">
          从左侧按住拖到画布；点击节点两侧锚点拖出连线。Delete 可删除选中元素。
        </p>
      </aside>

      <div ref="containerRef" class="canvas" />

      <aside class="props">
        <div class="caption">属性面板</div>
        <div v-if="!hasSelection" class="empty">点击节点或连线进行编辑</div>
        <template v-else>
          <label>ID</label>
          <input :value="selected.id" disabled />

          <label>类型</label>
          <input :value="selected.type" disabled />

          <label>文本</label>
          <input v-model="selected.text" @change="applyText" @keyup.enter="applyText" />

          <template v-if="selected.kind === 'node'">
            <label>节点类别</label>
            <select v-model="selected.properties.nodeKind" @change="applyProperties">
              <option value="start">开始</option>
              <option value="task">任务</option>
              <option value="gateway">网关</option>
              <option value="end">结束</option>
            </select>

            <label>审批人 / 办理人</label>
            <input
              v-model="selected.properties.assignee"
              placeholder="如：张三"
              @change="applyProperties"
            />

            <label>角色</label>
            <input
              v-model="selected.properties.role"
              placeholder="如：经理"
              @change="applyProperties"
            />

            <label>条件表达式</label>
            <input
              v-model="selected.properties.condition"
              placeholder="如：amount > 1000"
              @change="applyProperties"
            />
          </template>

          <button type="button" class="danger" @click="deleteSelected">删除选中</button>
        </template>
      </aside>
    </div>

    <div v-if="showJson" class="json-mask" @click.self="showJson = false">
      <div class="json-panel">
        <div class="json-head">
          <strong>流程图 JSON</strong>
          <button type="button" @click="showJson = false">关闭</button>
        </div>
        <pre>{{ graphJson }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lf-page {
  height: calc(100vh - 64px - 24px);
  min-height: 560px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(90deg, #f7f9fc, #fff);
  flex-wrap: wrap;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title span {
  font-size: 12px;
  color: #8c8c8c;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.actions button,
.edge-types button,
.props button,
.json-head button {
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}

.actions button.primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 180px 1fr 240px;
}

.palette,
.props {
  border-right: 1px solid #f0f0f0;
  background: #fafafa;
  padding: 12px;
  overflow: auto;
}

.props {
  border-right: none;
  border-left: 1px solid #f0f0f0;
}

.caption {
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
}

.palette-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #eee;
  border-left-width: 3px;
  border-radius: 8px;
  cursor: grab;
  user-select: none;
}

.palette-item:active {
  cursor: grabbing;
}

.palette-item i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.palette-item .name {
  font-size: 13px;
  font-weight: 600;
}

.palette-item .desc {
  font-size: 11px;
  color: #999;
}

.edge-types {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edge-types button.active {
  border-color: #1677ff;
  color: #1677ff;
  background: #e6f4ff;
}

.tip {
  margin-top: 14px;
  font-size: 12px;
  color: #8c8c8c;
  line-height: 1.6;
}

.canvas {
  width: 100%;
  height: 100%;
  position: relative;
}

.props label {
  display: block;
  font-size: 12px;
  color: #666;
  margin: 10px 0 4px;
}

.props input,
.props select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
}

.props .danger {
  margin-top: 16px;
  width: 100%;
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.empty {
  color: #bbb;
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

.json-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 24px;
}

.json-panel {
  width: min(720px, 100%);
  max-height: 80vh;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.json-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.json-panel pre {
  margin: 0;
  padding: 16px;
  overflow: auto;
  font-size: 12px;
  background: #f6f8fa;
}

@media (max-width: 960px) {
  .main {
    grid-template-columns: 140px 1fr;
  }

  .props {
    display: none;
  }
}
</style>
