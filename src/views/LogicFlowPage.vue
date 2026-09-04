<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import LogicFlow from '@logicflow/core'
import {
  AutoLayout,
  Control,
  CurvedEdge,
  CurvedEdgeModel,
  DndPanel,
  FlowPath,
  Highlight,
  InsertNodeInPolyline,
  Menu,
  MiniMap,
  ProximityConnect,
  SelectionSelect,
  Snapshot,
} from '@logicflow/extension'
import '@logicflow/core/es/index.css'
import '@logicflow/extension/es/index.css'

type ElementKind = 'node' | 'edge' | null
type HighlightMode = 'single' | 'path' | 'neighbour'

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
const showHelp = ref(false)
const pathList = ref<{ routeId: string; name: string; elements: string[] }[]>([])
const edgeType = ref('curved-edge')
const highlightMode = ref<HighlightMode>('path')
const proximityOn = ref(true)
const highlightOn = ref(true)
const miniMapOn = ref(true)

const hasSelection = computed(() => !!selected.id)

const edgeTypes = [
  { value: 'curved-edge', label: '圆角折线' },
  { value: 'polyline', label: '折线' },
  { value: 'bezier', label: '贝塞尔' },
  { value: 'line', label: '直线' },
]

const featureList = [
  'DndPanel 官方拖拽面板',
  'Control 缩放控制条',
  'Menu 右键菜单',
  'SelectionSelect 框选',
  'MiniMap 小地图',
  'Snapshot 导出图片',
  'Highlight 邻接/路径高亮',
  'ProximityConnect 靠近吸附连线',
  'InsertNodeInPolyline 拖到线上插入节点',
  'CurvedEdge 圆角边',
  'FlowPath 路径分析',
  'AutoLayout 自动布局',
]

const defaultData = {
  nodes: [
    {
      id: 'start',
      type: 'circle',
      x: 140,
      y: 240,
      text: '开始',
      properties: { nodeKind: 'start' },
    },
    {
      id: 'task1',
      type: 'rect',
      x: 340,
      y: 240,
      text: '提交申请',
      properties: { nodeKind: 'task', assignee: '发起人', role: '员工' },
    },
    {
      id: 'gateway',
      type: 'diamond',
      x: 560,
      y: 240,
      text: '金额判断',
      properties: { nodeKind: 'gateway', condition: '金额 > 1000' },
    },
    {
      id: 'task2',
      type: 'rect',
      x: 780,
      y: 120,
      text: '经理审批',
      properties: { nodeKind: 'task', assignee: '经理', role: '管理' },
    },
    {
      id: 'task3',
      type: 'rect',
      x: 780,
      y: 360,
      text: '自动通过',
      properties: { nodeKind: 'task', assignee: '系统', role: '-' },
    },
    {
      id: 'task4',
      type: 'rect',
      x: 1000,
      y: 120,
      text: '财务复核',
      properties: { nodeKind: 'task', assignee: '财务', role: '财务' },
    },
    {
      id: 'end',
      type: 'circle',
      x: 1220,
      y: 240,
      text: '结束',
      properties: { nodeKind: 'end' },
    },
  ],
  edges: [
    { id: 'e1', type: 'curved-edge', sourceNodeId: 'start', targetNodeId: 'task1' },
    { id: 'e2', type: 'curved-edge', sourceNodeId: 'task1', targetNodeId: 'gateway' },
    { id: 'e3', type: 'curved-edge', sourceNodeId: 'gateway', targetNodeId: 'task2', text: '>1000' },
    { id: 'e4', type: 'curved-edge', sourceNodeId: 'gateway', targetNodeId: 'task3', text: '≤1000' },
    { id: 'e5', type: 'curved-edge', sourceNodeId: 'task2', targetNodeId: 'task4' },
    { id: 'e6', type: 'curved-edge', sourceNodeId: 'task4', targetNodeId: 'end' },
    { id: 'e7', type: 'curved-edge', sourceNodeId: 'task3', targetNodeId: 'end' },
  ],
}

const dndIcons = {
  select:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAAH6ji2bAAAABGdBTUEAALGPC/xhBQAAAOVJREFUOBGtVMENwzAIjKP++2026ETdpv10iy7WFbqFyyW6GBywLCv5gI+Dw2Bluj1znuSjhb99Gkn6QILDY2imo60p8nsnc9bEo3+QJ+AKHfMdZHnl78wyTnyHZD53Zzx73MRSgYvnqgCUHj6gwdck7Zsp1VOrz0Uz8NbKunzAW+Gu4fYW28bUYutYlzSa7B84Fh7d1kjLwhcSdYAYrdkMQVpsBr5XgDGuXwQfQr0y9zwLda+DUYXLaGKdd2ZTtvbolaO87pdo24hP7ov16N0zArH1ur3iwJpXxm+v7oAJNR4JEP8DoAuSFEkYH7cAAAAASUVORK5CYII=',
  start:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAAH6ji2bAAAABGdBTUEAALGPC/xhBQAAAnBJREFUOBGdVL1rU1EcPfdGBddmaZLiEhdx1MHZQXApraCzQ7GKLgoRBxMfcRELuihWKcXFRcEWF8HBf0DdDCKYRZpnl7p0svLe9Zzbd29eQhTbC8nv+9zf130AT63jvooOGS8Vf9Nt5zxba7sXQwODfkWpkbjTQfCGUd9gIp3uuPP8bZ946g56dYQvnBg+b1HB8VIQmMFrazKcKSvFW2dQTxJnJdQ77urmXWOMBCmXM2Rke4S7UAW+/8ywwFoewmBps2tu7mbTdp8VMOkIRAkKfrVawalJTtIliclFbaOBqa0M2xImHeVIfd/nKAfVq/LGnPss5Kh00VEdSzfwnBXPUpmykNss4lUI9C1ga+8PNrBD5YeqRY2Zz8PhjooIbfJXjowvQJBqkmEkVnktWhwu2SM7SMx7Cj0N9IC0oQXRo8xwAGzQms+xrB/nNSUWVveI48ayrFGyC2+E2C+aWrZHXvOuz+CiV6iycWe1Rd1Q6+QUG07nb5SbPrL4426d+9E1axKjY3AoRrlEeSQo2Eu0T6BWAAr6COhTcWjRaYfKG5csnvytvUr/WY4rrPMB53Uo7jZRjXaG6/CFfNMaXEu75nG47X+oepU7PKJvvzGDY1YLSKHJrK7FUwXKkaxwhCW3u+sDrIju54RY5ErkJggg==',
  task:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAAH6ji2bAAAABGdBTUEAALGPC/xhBQAAAqlJREFUOBF9VM9rE0EUfrQ+tN66VWyitRVbRfBq9iUFKigIrQW3emKmn9A5oNm+D0SgVC89+ANY/QX+Frz15N7iRQm80j2kEja5UUizURsr+xm+N7vzq6EiEx8yy5eZ9/neTF7cZiZSPyJgghcUoL5LvTbs5bCf6xXx2LRJyGW+QLOZm1d9ogzS7rV0LtjZO9gOw9+ZJ+tNrMTUzSAwW1flFqFTrxjyzjmcwRIQJgHepdoo0zfkiqaPg6oIS7QDxGXwn9zXlwHZByNxP9bN5rX1mH52lAvH5Jh+IdgBjZkjlNOw6PnH4PME+PD4jaQ+aDxxjATNUgUiQcjOiRCFYCanuve6hRIzSpaiR1MfR+DWJCoJ2YFOkQYAsJn5AG2jJYtgAqnLBqfFIBsQ0VxpSk3CcH3E8CITmdGZUyNxjmq39MhPdYdOZ2O0E3DQJCQSuNuqATLyLf4khEuoYJyGxCLvIf8EYyhTb4Ts1dQ1CE213ik55hB6YUJLaf1tcpDvqGCX8wVQ7FjcpVIB359WtGs0mT9kt54QhkJ3THI7O8YuENf/23ScQagbPaBV1zfBT0nmvuUenycqO4q+e+rCX9SbO2dQ+9jDVx0FFyYBS+Is3W/J+A/U9E/GG3Jhl1/9413j8AAAAASUVORK5CYII=',
  gateway:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAAH6ji2bAAAABGdBTUEAALGPC/xhBQAAA1BJREFUOBFtVE1IVFEYfe/+8TUaUUg+xQttQq1QS1dBEF7UQq0W1aJVtHIV7YIWbXLhQq2CNma1C6FtFBREJBAdQgkpBYkwmY/+8/7uzN17p/fGQJh5z/nO+e53z/mOmXN3TQQEQ0A7S8ebVpYUF82zXvfbnXd3GNsXEpOyiZ+hYZTDmeeEFuvU6zD9ZzfU/BeS7U1u8sxfU2NqlkD8F6DOq+8O1peVF1Ed98cV8qXVTMTFAiVCBhwfEzKvlGAB3Q62jiAd+C7Cf0ByKaD7i1K2geQd8LZYbgD5GbuGp7R1Fde+tOwU8/Nm0T4g2MfLNbhgocY6O5w8jHfK+cZtNZykFGnY6MLppJdXcxLEoM5N6BQTOdKy78aV+h23DahKnk4dYIJUhESgai0w6jbd3N/cT5fg8khndAVltbYHCbC+pB5RS8xZNefswcI+p3ZJNi5z0deT1/IsQThtQ+sFwrLQDTugnR7XXjtjRQS7/GLhUi+W2qshx+DixkTYdiL/i9gCE9+EZrshpQARFGXkNf2hQe9lXsBTNg4JSV88bPZWAM/D1fY9B5QKoarA5fDBbYfWO4rqXNpsAdeOvW7+A4hH9Cd+V8hhYUhOJkZYEsC2gPVOSE4afxSOFSBOf+nmhR4Ay/5wHx1+dXzTdAFZ0jEkjD97pwWDXk6pw+CC8wE8rsN1LEQLHTr/vb7CDe0bBkQY+M3RkyfgDCfi+jN/LP07TBwHOe3bR/qw7o37yA5N3bYy8AN+53B4Q9TB9EMRZP8bzYs2cSsQIbRWzdwa/ur+6FP3Ip5qNmzsjC1u9hNmQOcT6rqO0OqAo2dtiAocSwwCeqsj48U9V/F9FKbYXqm8Sz8a5SjYEEfR8gW/9l2Hp5pFd7W7i2qigQqigCHidu+P0Q/lHdjT5U6Q+2rwI6X2aJ4bd9AM2DAqRnP5BCDRLG4ewm5+BbXB/XQ9cQgBV8o0/bQLwMw8+8bQK+8W/smYD5K/WqJI5cQNwAAAABJRU5ErkJggg==',
  end:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAAH6ji2bAAAABGdBTUEAALGPC/xhBQAAAnBJREFUOBGdVL1rU1EcPfdGBddmaZLiEhdx1MHZQXApraCzQ7GKLgoRBxMfcRELuihWKcXFRcEWF8HBf0DdDCKYRZpnl7p0svLe9Zzbd29eQhTbC8nv+9zf130AT63jvooOGS8Vf9Nt5zxba7sXQwODfkWpkbjTQfCGUd9gIp3uuPP8bZ946g56dYQvnBg+b1HB8VIQmMFrazKcKSvFW2dQTxJnJdQ77urmXWOMBCmXM2Rke4S7UAW+/8ywwFoewmBps2tu7mbTdp8VMOkIRAkKfrVawalJTtIliclFbaOBqa0M2xImHeVIfd/nKAfVq/LGnPss5Kh00VEdSzfwnBXPUpmykNss4lUI9C1ga+8PNrBD5YeqRY2Zz8PhjooIbfJXjowvQJBqkmEkVnktWhwu2SM7SMx7Cj0N9IC0oQXRo8xwAGzQms+xrB/nNSUWVveI48ayrFGyC2+E2C+aWrZHXvOuz+CiV6iycWe1Rd1Q6+QUG07nb5SbPrL4426d+9E1axKjY3AoRrlEeSQo2Eu0T6BWAAr6COhTcWjRaYfKG5csnvytvUr/WY4rrPMB53Uo7jZRjXaG6/CFfNMaXEu75nG47X+oepU7PKJvvzGDY1YLSKHJrK7FUwXKkaxwhCW3u+sDrIju54RY5ErkJggg==',
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
  graphJson.value = JSON.stringify(lf.getGraphData(), null, 2)
  showJson.value = true
}

function downloadJson() {
  if (!lf) return
  const blob = new Blob([JSON.stringify(lf.getGraphData(), null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `workflow-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function snapshotPng() {
  const anyLf = lf as any
  if (anyLf?.getSnapshot) await anyLf.getSnapshot()
  else if (anyLf?.extension?.snapshot?.getSnapshot) {
    await anyLf.extension.snapshot.getSnapshot()
  }
}

function resetDemo() {
  if (!lf) return
  lf.render(defaultData as any)
  clearSelection()
  pathList.value = []
  nextTick(() => lf?.fitView(40))
}

function openSelection() {
  const ext = (lf as any)?.extension?.selectionSelect
  ext?.openSelectionSelect?.()
  lf?.once('selection:selected', () => ext?.closeSelectionSelect?.())
}

function toggleMiniMap() {
  miniMapOn.value = !miniMapOn.value
  const mm = (lf as any)?.extension?.miniMap
  if (!mm) return
  if (miniMapOn.value) mm.show?.(true)
  else mm.hide?.()
}

function setHighlightMode(mode: HighlightMode) {
  highlightMode.value = mode
  const hl = (lf as any)?.extension?.highlight
  hl?.setMode?.(mode)
}

function toggleHighlight() {
  highlightOn.value = !highlightOn.value
  const hl = (lf as any)?.extension?.highlight
  hl?.setEnable?.(highlightOn.value)
  if (!highlightOn.value) hl?.restoreHighlight?.()
}

function toggleProximity() {
  proximityOn.value = !proximityOn.value
  const pc = (lf as any)?.extension?.proximityConnect
  if (pc) pc.enable = proximityOn.value
}

function analyzePaths() {
  if (!lf) return
  const fp = (lf as any).extension?.flowPath
  if (!fp) return
  fp.startNodeType = 'circle'
  // FlowPath 通过 startNodeType 找开始节点；示例开始是 circle
  try {
    const paths = fp.getPathes?.() || []
    pathList.value = paths.map((p: any) => ({
      routeId: p.routeId,
      name: p.name || p.routeId,
      elements: p.elements || [],
    }))
  } catch (e) {
    pathList.value = []
    console.warn(e)
  }
}

function autoLayout() {
  if (!lf) return
  const al = (lf as any).extension?.autoLayout
  const fp = (lf as any).extension?.flowPath
  if (!al || !fp) return
  try {
    fp.startNodeType = 'circle'
    const paths = fp.getPathes?.() || []
    const data = lf.getGraphRawData()
    al.layout?.(data, paths)
    lf.render(data)
    nextTick(() => lf?.fitView(40))
  } catch (e) {
    console.warn('自动布局失败（插件标注未完善）', e)
  }
}

function highlightSelectedPath() {
  if (!lf || !selected.id) return
  const hl = (lf as any).extension?.highlight
  hl?.setEnable?.(true)
  hl?.setMode?.('path')
  hl?.highlight?.(selected.id, 'path')
  highlightOn.value = true
  highlightMode.value = 'path'
}

function setupDndPanel() {
  const dnd = (lf as any)?.extension?.dndPanel
  if (!dnd?.setPatternItems) return

  dnd.setPatternItems([
    {
      label: '框选',
      icon: dndIcons.select,
      callback: () => openSelection(),
    },
    {
      type: 'circle',
      text: '开始',
      label: '开始',
      icon: dndIcons.start,
      properties: { nodeKind: 'start' },
    },
    {
      type: 'rect',
      text: '审批节点',
      label: '审批',
      icon: dndIcons.task,
      properties: { nodeKind: 'task', assignee: '', role: '' },
    },
    {
      type: 'rect',
      text: '办理节点',
      label: '办理',
      icon: dndIcons.task,
      properties: { nodeKind: 'task', assignee: '', role: '' },
    },
    {
      type: 'diamond',
      text: '条件网关',
      label: '网关',
      icon: dndIcons.gateway,
      properties: { nodeKind: 'gateway', condition: '' },
    },
    {
      type: 'circle',
      text: '结束',
      label: '结束',
      icon: dndIcons.end,
      properties: { nodeKind: 'end' },
    },
  ])
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
    // 交互增强
    isSilentMode: false,
    stopScrollGraph: false,
    stopZoomGraph: false,
    adjustEdge: true,
    adjustEdgeStartAndEnd: true,
    edgeTextEdit: true,
    edgeTextDraggable: true,
    nodeTextEdit: true,
    nodeTextDraggable: true,
    hoverOutline: true,
    nodeSelectedOutline: true,
    edgeSelectedOutline: true,
    multipleSelectKey: 'shift',
    style: {
      rect: { rx: 6, ry: 6, strokeWidth: 2, stroke: '#1677ff', fill: '#e6f4ff' },
      circle: { strokeWidth: 2, stroke: '#52c41a', fill: '#f6ffed', r: 28 },
      diamond: { strokeWidth: 2, stroke: '#fa8c16', fill: '#fff7e6' },
      polyline: { strokeWidth: 2, stroke: '#8c8c8c' },
      nodeText: { fontSize: 13, color: '#262626' },
      edgeText: {
        fontSize: 12,
        color: '#595959',
        background: { fill: '#fff' },
      },
    },
    plugins: [
      Control,
      Menu,
      Snapshot,
      SelectionSelect,
      MiniMap,
      DndPanel,
      Highlight,
      ProximityConnect,
      InsertNodeInPolyline,
      FlowPath,
      AutoLayout,
    ],
    pluginsOptions: {
      miniMap: {
        isShowHeader: false,
        isShowCloseIcon: true,
        width: 168,
        height: 120,
      },
      highlight: {
        mode: 'path',
      },
      proximityConnect: {
        enable: true,
        distance: 100,
        type: 'default',
      },
    },
  })

  // 圆角折线物料
  lf.register({
    type: 'curved-edge',
    view: CurvedEdge,
    model: CurvedEdgeModel,
  })
  lf.setDefaultEdgeType(edgeType.value)

  setupDndPanel()

  const menu = (lf.extension as any).menu
  menu?.setMenuConfig?.({
    nodeMenu: [
      {
        text: '高亮路径',
        callback(node: any) {
          fillNodeSelection(node)
          highlightSelectedPath()
        },
      },
      {
        text: '复制节点',
        callback(node: any) {
          lf?.cloneNode(node.id)
        },
      },
      {
        text: '删除节点',
        callback(node: any) {
          lf?.deleteNode(node.id)
          clearSelection()
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
        text: '框选',
        callback() {
          openSelection()
        },
      },
      {
        text: '适应画布',
        callback() {
          lf?.fitView(40)
        },
      },
      {
        text: '分析路径',
        callback() {
          analyzePaths()
        },
      },
    ],
  })

  lf.on('node:click', ({ data }) => {
    fillNodeSelection(data)
    if (highlightOn.value) {
      ;(lf as any).extension?.highlight?.highlight?.(data.id, highlightMode.value)
    }
  })
  lf.on('edge:click', ({ data }) => fillEdgeSelection(data))
  lf.on('blank:click', () => {
    clearSelection()
    ;(lf as any).extension?.highlight?.restoreHighlight?.()
  })
  lf.on('node:dnd-add', ({ data }) => fillNodeSelection(data))

  lf.render(defaultData as any)
  nextTick(() => {
    lf?.fitView(40)
    try {
      ;(lf as any).extension?.miniMap?.show?.(true)
    } catch {
      // ignore
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
        <strong>LogicFlow 工作流（扩展增强）</strong>
        <span>官方插件：拖拽面板 / 高亮 / 吸附连线 / 线上插点 / 圆角边 / 路径 / 布局 / 小地图…</span>
      </div>
      <div class="actions">
        <button type="button" @click="undo">撤销</button>
        <button type="button" @click="redo">重做</button>
        <button type="button" @click="zoomIn">放大</button>
        <button type="button" @click="zoomOut">缩小</button>
        <button type="button" @click="fitView">适应</button>
        <button type="button" @click="resetZoom">居中</button>
        <button type="button" @click="openSelection">框选</button>
        <button type="button" @click="analyzePaths">分析路径</button>
        <button type="button" @click="autoLayout">自动布局</button>
        <button type="button" @click="exportJson">查看 JSON</button>
        <button type="button" @click="downloadJson">下载 JSON</button>
        <button type="button" @click="snapshotPng">导出图片</button>
        <button type="button" @click="showHelp = true">已启用插件</button>
        <button type="button" class="primary" @click="resetDemo">重置示例</button>
      </div>
    </div>

    <div class="main">
      <aside class="side">
        <div class="caption">连线类型</div>
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

        <div class="caption">高亮模式</div>
        <div class="edge-types">
          <button
            type="button"
            :class="{ active: highlightMode === 'single' }"
            @click="setHighlightMode('single')"
          >
            单节点
          </button>
          <button
            type="button"
            :class="{ active: highlightMode === 'neighbour' }"
            @click="setHighlightMode('neighbour')"
          >
            邻接
          </button>
          <button
            type="button"
            :class="{ active: highlightMode === 'path' }"
            @click="setHighlightMode('path')"
          >
            路径
          </button>
        </div>

        <div class="caption">开关</div>
        <label class="switch">
          <input type="checkbox" :checked="highlightOn" @change="toggleHighlight" />
          Highlight 高亮
        </label>
        <label class="switch">
          <input type="checkbox" :checked="proximityOn" @change="toggleProximity" />
          靠近吸附连线
        </label>
        <label class="switch">
          <input type="checkbox" :checked="miniMapOn" @change="toggleMiniMap" />
          MiniMap
        </label>

        <div class="caption">操作提示</div>
        <ul class="tips">
          <li>左侧官方 <b>DndPanel</b> 拖节点</li>
          <li>节点拖到<strong>折线中间</strong>可插入</li>
          <li>拖近其他节点会<strong>吸附预览连线</strong></li>
          <li>Shift + 框选多选</li>
          <li>双击文本可编辑</li>
        </ul>

        <div v-if="pathList.length" class="caption">路径结果</div>
        <div v-for="p in pathList" :key="p.routeId" class="path-item">
          <div class="path-name">{{ p.name || p.routeId }}</div>
          <div class="path-els">{{ p.elements.join(' → ') }}</div>
        </div>
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

            <button type="button" class="ghost" @click="highlightSelectedPath">
              高亮经过此节点的路径
            </button>
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

    <div v-if="showHelp" class="json-mask" @click.self="showHelp = false">
      <div class="json-panel help">
        <div class="json-head">
          <strong>本页已接入的 LogicFlow 扩展</strong>
          <button type="button" @click="showHelp = false">关闭</button>
        </div>
        <ul>
          <li v-for="f in featureList" :key="f">{{ f }}</li>
        </ul>
        <p class="note">
          未默认接入：BPMN 全套元素、泳道 Pool、DynamicGroup（更重，可按业务再开）。
        </p>
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
  grid-template-columns: 190px 1fr 240px;
}

.side,
.props {
  background: #fafafa;
  padding: 12px;
  overflow: auto;
}

.side {
  border-right: 1px solid #f0f0f0;
}

.props {
  border-left: 1px solid #f0f0f0;
}

.caption {
  font-size: 12px;
  color: #999;
  margin: 12px 0 8px;
}

.caption:first-child {
  margin-top: 0;
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

.switch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #555;
  margin-bottom: 6px;
}

.tips {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: #666;
  line-height: 1.7;
}

.path-item {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}

.path-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.path-els {
  color: #888;
  word-break: break-all;
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

.props .ghost {
  margin-top: 10px;
  width: 100%;
  color: #1677ff;
  border-color: #91caff;
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

.json-panel.help {
  width: min(520px, 100%);
}

.json-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.json-panel pre,
.json-panel ul {
  margin: 0;
  padding: 16px;
  overflow: auto;
  font-size: 13px;
  background: #f6f8fa;
}

.json-panel ul {
  line-height: 1.8;
}

.note {
  margin: 0;
  padding: 12px 16px 16px;
  font-size: 12px;
  color: #888;
}

@media (max-width: 960px) {
  .main {
    grid-template-columns: 1fr;
  }

  .side,
  .props {
    display: none;
  }
}
</style>
