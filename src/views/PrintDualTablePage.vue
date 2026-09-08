<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  alignPagePairs,
  createMockRows,
  getContentSizeMm,
  getPageSizeMm,
  getSideTableWidthMm,
  mmToPx,
  packByHeight,
  sliceByIndexPages,
  splitEvenly,
  type PagePair,
  type PaperOrientation,
  type TableRow,
  DEFAULT_GAP_MM,
  DEFAULT_MARGIN_MM,
} from '../utils/printDualTable'

const orientation = ref<PaperOrientation>('portrait')
const rowCount = ref(24)
const gapMm = ref(DEFAULT_GAP_MM)
const marginMm = DEFAULT_MARGIN_MM

const measureRoot = ref<HTMLElement | null>(null)
const pages = ref<PagePair<TableRow>[]>([{ left: [], right: [] }])
const measuring = ref(false)

const rows = computed(() => createMockRows(Number(rowCount.value) || 1))
const split = computed(() => splitEvenly(rows.value))

const pageSize = computed(() => getPageSizeMm(orientation.value))
const contentSize = computed(() =>
  getContentSizeMm(orientation.value, marginMm),
)
const sideWidthMm = computed(() =>
  getSideTableWidthMm(
    contentSize.value.width,
    Number(gapMm.value) || DEFAULT_GAP_MM,
  ),
)

const gapMmSafe = computed(() => Number(gapMm.value) || DEFAULT_GAP_MM)

let styleEl: HTMLStyleElement | null = null
let measureTimer: ReturnType<typeof setTimeout> | null = null

function ensurePrintPageStyle() {
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'print-dual-table-page-style'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = `@page { size: A4 ${orientation.value}; margin: ${marginMm}mm; }`
}

function readRowHeights(side: 'left' | 'right'): number[] {
  const root = measureRoot.value
  if (!root) return []
  const table = root.querySelector<HTMLElement>(`table[data-side="${side}"]`)
  if (!table) return []
  const bodyRows = table.querySelectorAll<HTMLElement>('tbody tr')
  return Array.from(bodyRows).map((tr) => tr.getBoundingClientRect().height)
}

function readHeaderHeight(): number {
  const root = measureRoot.value
  if (!root) return 28
  const th = root.querySelector<HTMLElement>('table[data-side="left"] thead tr')
  return th?.getBoundingClientRect().height ?? 28
}

async function recomputePages() {
  measuring.value = true
  await nextTick()
  // 等字体/换行稳定
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const availablePx = Math.max(
    1,
    mmToPx(contentSize.value.height) - readHeaderHeight(),
  )

  const leftHeights = readRowHeights('left')
  const rightHeights = readRowHeights('right')

  const leftIndexPages = packByHeight(leftHeights, availablePx)
  const rightIndexPages = packByHeight(rightHeights, availablePx)

  const leftPages = sliceByIndexPages(split.value.left, leftIndexPages)
  const rightPages = sliceByIndexPages(split.value.right, rightIndexPages)

  pages.value = alignPagePairs(leftPages, rightPages)
  measuring.value = false
}

function scheduleRecompute() {
  if (measureTimer) clearTimeout(measureTimer)
  measureTimer = setTimeout(() => {
    void recomputePages()
  }, 50)
}

function handlePrint() {
  ensurePrintPageStyle()
  window.print()
}

watch(
  [orientation, rowCount, gapMm],
  () => {
    ensurePrintPageStyle()
    scheduleRecompute()
  },
  { immediate: true },
)

onMounted(() => {
  ensurePrintPageStyle()
  scheduleRecompute()
})

onBeforeUnmount(() => {
  if (measureTimer) clearTimeout(measureTimer)
  styleEl?.remove()
  styleEl = null
})
</script>

<template>
  <div class="page">
    <a-card class="toolbar no-print" title="双表 A4 打印" size="small">
      <a-space wrap>
        <a-radio-group v-model:value="orientation" button-style="solid">
          <a-radio-button value="portrait">纵向</a-radio-button>
          <a-radio-button value="landscape">横向</a-radio-button>
        </a-radio-group>

        <span>数据条数</span>
        <a-input-number v-model:value="rowCount" :min="1" :max="200" />

        <span>中间缝 (mm)</span>
        <a-input-number v-model:value="gapMm" :min="2" :max="30" :step="1" />

        <a-button type="primary" @click="handlePrint">打印</a-button>
        <a-button @click="scheduleRecompute">重新分页</a-button>
        <a-tag v-if="measuring" color="processing">测量中…</a-tag>
        <a-tag v-else color="success">共 {{ pages.length }} 页</a-tag>
      </a-space>
      <p class="hint">
        同一套数据均分到左/右表；按实测行高分页，避免换行导致半行被 A4 截断。
      </p>
    </a-card>

    <!-- 隐藏测量区：与打印表同宽同样式，用于读取换行后行高 -->
    <div
      ref="measureRoot"
      class="measure-root"
      aria-hidden="true"
      :style="{ width: `${contentSize.width}mm` }"
    >
      <div class="measure-row" :style="{ gap: `${gapMmSafe}mm` }">
        <table
          class="data-table"
          data-side="left"
          :style="{ width: `${sideWidthMm}mm` }"
        >
          <thead>
            <tr>
              <th class="col-id">序号</th>
              <th class="col-name">名称</th>
              <th class="col-remark">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in split.left" :key="`m-l-${row.id}`">
              <td>{{ row.id }}</td>
              <td>{{ row.name }}</td>
              <td class="remark">{{ row.remark }}</td>
            </tr>
          </tbody>
        </table>
        <table
          class="data-table"
          data-side="right"
          :style="{ width: `${sideWidthMm}mm` }"
        >
          <thead>
            <tr>
              <th class="col-id">序号</th>
              <th class="col-name">名称</th>
              <th class="col-remark">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in split.right" :key="`m-r-${row.id}`">
              <td>{{ row.id }}</td>
              <td>{{ row.name }}</td>
              <td class="remark">{{ row.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="preview-wrap print-root">
      <div
        v-for="(pair, pageIndex) in pages"
        :key="pageIndex"
        class="print-page"
        :class="{ 'is-last': pageIndex === pages.length - 1 }"
        :style="{
          width: `${pageSize.width}mm`,
          minHeight: `${pageSize.height}mm`,
          padding: `${marginMm}mm`,
        }"
      >
        <div class="page-body" :style="{ gap: `${gapMmSafe}mm` }">
          <table
            class="data-table"
            :style="{ width: `${sideWidthMm}mm` }"
          >
            <thead>
              <tr>
                <th class="col-id">序号</th>
                <th class="col-name">名称</th>
                <th class="col-remark">备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pair.left" :key="`p${pageIndex}-l-${row.id}`">
                <td>{{ row.id }}</td>
                <td>{{ row.name }}</td>
                <td class="remark">{{ row.remark }}</td>
              </tr>
              <tr v-if="!pair.left.length">
                <td colspan="3" class="empty">（本页无数据）</td>
              </tr>
            </tbody>
          </table>

          <div class="gap" :style="{ width: `${gapMmSafe}mm` }" />

          <table
            class="data-table"
            :style="{ width: `${sideWidthMm}mm` }"
          >
            <thead>
              <tr>
                <th class="col-id">序号</th>
                <th class="col-name">名称</th>
                <th class="col-remark">备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pair.right" :key="`p${pageIndex}-r-${row.id}`">
                <td>{{ row.id }}</td>
                <td>{{ row.name }}</td>
                <td class="remark">{{ row.remark }}</td>
              </tr>
              <tr v-if="!pair.right.length">
                <td colspan="3" class="empty">（本页无数据）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="page-footer no-print">第 {{ pageIndex + 1 }} / {{ pages.length }} 页</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
}

.hint {
  margin: 12px 0 0;
  color: #666;
  font-size: 13px;
}

.measure-root {
  position: absolute;
  left: -99999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.measure-row {
  display: flex;
  align-items: flex-start;
}

.preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-bottom: 24px;
}

.print-page {
  box-sizing: border-box;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
}

.page-body {
  display: flex;
  align-items: flex-start;
  flex: 1;
}

.gap {
  flex: 0 0 auto;
  align-self: stretch;
  background: repeating-linear-gradient(
    -45deg,
    #f0f0f0,
    #f0f0f0 4px,
    #fafafa 4px,
    #fafafa 8px
  );
  border-left: 1px dashed #bbb;
  border-right: 1px dashed #bbb;
}

.page-footer {
  margin-top: 8px;
  text-align: center;
  color: #999;
  font-size: 12px;
}

.data-table {
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  line-height: 1.4;
  color: #222;
}

.data-table th,
.data-table td {
  border: 1px solid #333;
  padding: 4px 6px;
  vertical-align: top;
  word-break: break-word;
  white-space: pre-wrap;
}

.data-table th {
  background: #f5f5f5;
  font-weight: 600;
  text-align: center;
}

.col-id {
  width: 18%;
}

.col-name {
  width: 28%;
}

.col-remark {
  width: 54%;
}

.remark {
  white-space: pre-wrap;
}

.empty {
  text-align: center;
  color: #999;
  border-style: dashed;
}
</style>

<style>
/* 打印：隐藏站点壳与工具栏，只留纸面 */
@media print {
  .header,
  .no-print {
    display: none !important;
  }

  .content {
    padding: 0 !important;
    background: #fff !important;
  }

  .page {
    padding: 0 !important;
    gap: 0 !important;
  }

  .preview-wrap {
    gap: 0 !important;
    padding: 0 !important;
    display: block !important;
  }

  .print-page {
    box-shadow: none !important;
    width: auto !important;
    min-height: auto !important;
    padding: 0 !important;
    page-break-after: always;
    break-after: page;
  }

  .print-page.is-last {
    page-break-after: auto;
    break-after: auto;
  }

  .gap {
    background: none !important;
  }
}
</style>
