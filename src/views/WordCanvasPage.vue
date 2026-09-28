<script setup lang="ts">
/**
 * 类 Word「自由画布」编辑区 demo —— 不使用任何富文本库,纯 Vue 手写。
 *
 * 核心机制(和 Word 浮动对象同款思路):
 * 1. 文档数据 = 元素数组 { id, type, x, y, w, h, z },全部绝对定位在纸张画布上
 * 2. 拖动移动 / 拖手柄缩放:统一走 pointerdown → window pointermove → pointerup,
 *    拖动过程直接改响应式数据(元素少时无需节流),松开即完成
 * 3. 文本框:双击进入编辑(textarea 覆盖),失焦提交纯文本 —— 不是富文本
 * 4. 图片:工具栏插入 / 从系统直接拖入画布(落在鼠标位置)
 * 5. 网格吸附:默认 8px 栅格,按住 Shift 临时自由拖动
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { message } from "ant-design-vue";

type CanvasElementType = "text" | "image";

interface CanvasElement {
  id: number;
  type: CanvasElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  text?: string; // type = text
  src?: string; // type = image
}

const GRID = 8;
const MIN_SIZE = 40;

const elements = ref<CanvasElement[]>([]);
const selectedId = ref<number | null>(null);
const editingId = ref<number | null>(null); // 正在编辑的文本框
const snapEnabled = ref(true);
const canvasEl = ref<HTMLDivElement>();
const fileInput = ref<HTMLInputElement>();
const showJson = ref(false);

let nextId = 1;
let nextZ = 1;

const selected = computed(
  () => elements.value.find((e) => e.id === selectedId.value) ?? null,
);

/* ---------------- 插入 ---------------- */

function addText(x = 60, y = 60) {
  const el: CanvasElement = {
    id: nextId++,
    type: "text",
    x,
    y,
    w: 260,
    h: 96,
    z: nextZ++,
    text: "双击编辑这段文字",
  };
  elements.value.push(el);
  selectedId.value = el.id;
  editingId.value = el.id; // 插入即进入编辑
}

function addImage(src: string, x?: number, y?: number, natural?: { w: number; h: number }) {
  // 默认限制最大 480px,保持原始比例
  let w = natural?.w ?? 320;
  let h = natural?.h ?? 200;
  const max = 480;
  if (w > max) {
    h = (h * max) / w;
    w = max;
  }
  const el: CanvasElement = {
    id: nextId++,
    type: "image",
    x: x ?? 100,
    y: y ?? 100,
    w: Math.round(w),
    h: Math.round(h),
    z: nextZ++,
    src,
  };
  elements.value.push(el);
  selectedId.value = el.id;
}

function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) readImageFile(file);
  input.value = "";
}

function readImageFile(file: File, x?: number, y?: number) {
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result as string;
    const img = new Image();
    img.onload = () => addImage(src, x, y, { w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  };
  reader.readAsDataURL(file);
}

function insertImageUrl() {
  const url = window.prompt(
    "请输入图片地址",
    "https://www.gstatic.com/webp/gallery/1.jpg",
  );
  if (!url) return;
  const img = new Image();
  img.onload = () => addImage(url, undefined, undefined, { w: img.naturalWidth, h: img.naturalHeight });
  img.onerror = () => addImage(url); // 加载失败也先插入(离线演示)
  img.src = url;
}

/* 从系统资源管理器拖图片进画布 → 落在释放位置 */
function onCanvasDrop(e: DragEvent) {
  e.preventDefault();
  const file = Array.from(e.dataTransfer?.files || []).find((f) =>
    f.type.startsWith("image/"),
  );
  if (!file || !canvasEl.value) return;
  const rect = canvasEl.value.getBoundingClientRect();
  const x = snap((e.clientX ?? 0) - rect.left - 60);
  const y = snap((e.clientY ?? 0) - rect.top - 40);
  readImageFile(file, Math.max(0, x), Math.max(0, y));
}

/* ---------------- 选中 / 删除 / 层级 ---------------- */

function select(id: number) {
  selectedId.value = id;
}

function deselect() {
  selectedId.value = null;
  editingId.value = null;
}

function removeSelected() {
  if (selectedId.value == null) return;
  elements.value = elements.value.filter((e) => e.id !== selectedId.value);
  if (editingId.value === selectedId.value) editingId.value = null;
  selectedId.value = null;
}

function bringForward() {
  if (selected.value) selected.value.z = nextZ++;
}

function sendBackward() {
  if (!selected.value) return;
  const minZ = Math.min(...elements.value.map((e) => e.z));
  selected.value.z = minZ - 1;
}

function clearAll() {
  elements.value = [];
  deselect();
}

/* ---------------- 拖动 & 缩放(统一 pointer 流程) ---------------- */

type DragMode = "move" | "resize";
interface DragState {
  mode: DragMode;
  id: number;
  dir: string; // resize 方向:n/s/e/w/ne/nw/se/sw,move 时为空
  startX: number; // 指针起点
  startY: number;
  ox: number; // 元素原始 rect
  oy: number;
  ow: number;
  oh: number;
}
let drag: DragState | null = null;

const snap = (v: number) => (snapEnabled.value ? Math.round(v / GRID) * GRID : Math.round(v));

function beginDrag(e: PointerEvent, el: CanvasElement, mode: DragMode, dir = "") {
  // 编辑文本时,正文区域不启动拖动(让光标可以点选文字);标题栏式整体拖动仍可用手柄区外按下
  if (mode === "move" && editingId.value === el.id) return;
  e.preventDefault();
  e.stopPropagation();
  drag = {
    mode,
    id: el.id,
    dir,
    startX: e.clientX,
    startY: e.clientY,
    ox: el.x,
    oy: el.y,
    ow: el.w,
    oh: el.h,
  };
  select(el.id);
  if (mode === "move") bringToFrontSilent(el);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag);
}

function bringToFrontSilent(el: CanvasElement) {
  el.z = nextZ++;
}

function onDragMove(e: PointerEvent) {
  if (!drag || !canvasEl.value) return;
  const el = elements.value.find((x) => x.id === drag!.id);
  if (!el) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  // Shift 临时关闭吸附
  const snapOn = snapEnabled.value && !e.shiftKey;
  const s = (v: number) => (snapOn ? Math.round(v / GRID) * GRID : Math.round(v));

  const canvasW = canvasEl.value.clientWidth;
  const canvasH = canvasEl.value.clientHeight;

  if (drag.mode === "move") {
    el.x = clamp(drag.ox + s(dx), -el.w + 40, canvasW - 40);
    el.y = clamp(drag.oy + s(dy), -el.h + 40, canvasH - 40);
    return;
  }

  // resize:按方向合成新 rect,保持最小尺寸
  const { dir } = drag;
  let x = drag.ox;
  let y = drag.oy;
  let w = drag.ow;
  let h = drag.oh;
  if (dir.includes("e")) w = drag.ow + s(dx);
  if (dir.includes("s")) h = drag.oh + s(dy);
  if (dir.includes("w")) {
    w = drag.ow - s(dx);
    x = drag.ox + (drag.ow - w);
  }
  if (dir.includes("n")) {
    h = drag.oh - s(dy);
    y = drag.oy + (drag.oh - h);
  }
  // 图片保持纵横比(拖角时)
  if (el.type === "image" && dir.length === 2) {
    const ratio = drag.ow / drag.oh;
    h = Math.round(w / ratio);
    if (dir.includes("n")) y = drag.oy + (drag.oh - h);
  }
  if (w < MIN_SIZE) {
    if (dir.includes("w")) x -= MIN_SIZE - w;
    w = MIN_SIZE;
  }
  if (h < MIN_SIZE) {
    if (dir.includes("n")) y -= MIN_SIZE - h;
    h = MIN_SIZE;
  }
  el.x = x;
  el.y = y;
  el.w = Math.min(w, canvasW);
  el.h = Math.min(h, canvasH);
}

function endDrag() {
  drag = null;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", endDrag);
}

const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

function handleStyle(dir: string) {
  const map: Record<string, Record<string, string>> = {
    n: { left: "50%", top: "0", transform: "translate(-50%,-50%)", cursor: "ns-resize" },
    s: { left: "50%", bottom: "0", transform: "translate(-50%,50%)", cursor: "ns-resize" },
    e: { top: "50%", right: "0", transform: "translate(50%,-50%)", cursor: "ew-resize" },
    w: { top: "50%", left: "0", transform: "translate(-50%,-50%)", cursor: "ew-resize" },
    ne: { top: "0", right: "0", transform: "translate(50%,-50%)", cursor: "nesw-resize" },
    nw: { top: "0", left: "0", transform: "translate(-50%,-50%)", cursor: "nwse-resize" },
    se: { bottom: "0", right: "0", transform: "translate(50%,50%)", cursor: "nwse-resize" },
    sw: { bottom: "0", left: "0", transform: "translate(-50%,50%)", cursor: "nesw-resize" },
  };
  return map[dir];
}

/* ---------------- 文本编辑 ---------------- */

function enterEdit(el: CanvasElement) {
  if (el.type !== "text") return;
  editingId.value = el.id;
}

function exitEdit() {
  editingId.value = null;
}

/* ---------------- 键盘 ---------------- */

function onKeydown(e: KeyboardEvent) {
  // 正在输入文本时不拦截
  if (editingId.value != null) return;
  const el = selected.value;
  if (!el) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    removeSelected();
    return;
  }
  const step = e.shiftKey ? GRID * 4 : GRID;
  const nudge: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const d = nudge[e.key];
  if (d) {
    e.preventDefault();
    el.x += d[0];
    el.y += d[1];
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  // 初始示例
  addText(GRID * 8, GRID * 8);
  editingId.value = null;
  elements.value[0].text = "季度采购说明\n\n双击本框可直接编辑纯文本;按住框体空白处可拖动,拖四角/四边手柄可缩放。";
  elements.value[0].w = 320;
  elements.value[0].h = 160;
  selectedId.value = null;
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  endDrag();
});

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/* ---------------- 导出 ---------------- */

const jsonOutput = computed(() =>
  JSON.stringify(
    {
      page: { w: 794, h: 1123 },
      elements: elements.value.map(
        ({ id, type, x, y, w, h, z, text, src }) => ({
          id,
          type,
          x,
          y,
          w,
          h,
          z,
          ...(type === "text" ? { text } : { src: src?.slice(0, 40) + "..." }),
        }),
      ),
    },
    null,
    2,
  ),
);

function exportJson() {
  showJson.value = true;
}

/* ---------------- 导出为图片(不依赖 html2canvas,直接拿 JSON 数据模型在原生 canvas 上重绘) ---------------- */

/** 预加载图片;crossOrigin 尽量避免污染画布(无 CORS 头的远程图仍会失败,下方有兜底提示) */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = src;
  });
}

/** 在 ctx(0,0) 处按元素宽高绘制纯文本,手动折行 + 溢出裁剪,对齐 DOM 里的 4px/6px 内边距 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
) {
  const fontSize = 14;
  const lineHeight = fontSize * 1.7;
  const padX = 6;
  const padY = 4;
  ctx.font = `${fontSize}px -apple-system, "Segoe UI", Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000";
  const maxW = w - padX * 2;
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    // 逐字度量折行(中文按字、英文按字母,demo 可接受的近似)
    let line = "";
    for (const ch of Array.from(para)) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  lines.forEach((ln, i) => {
    const y = padY + i * lineHeight;
    if (y + lineHeight > h + 2) return; // 溢出部分像 DOM 的 overflow:hidden 一样裁掉
    ctx.fillText(ln, padX, y);
  });
}

const exporting = ref(false);

async function exportImage() {
  const canvas = canvasEl.value;
  if (!canvas || exporting.value) return;
  exporting.value = true;
  try {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const scale = 2; // 2x 导出,避免文字/图片模糊
    const cv = document.createElement("canvas");
    cv.width = w * scale;
    cv.height = h * scale;
    const ctx = cv.getContext("2d")!;
    ctx.scale(scale, scale);
    // 白纸背景(不导出网格点背景,和打印保持一致)
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    // 按 z 升序绘制,与 DOM 叠放顺序一致
    const sorted = [...elements.value].sort((a, b) => a.z - b.z);
    const imgs = new Map<string, HTMLImageElement | null>();
    for (const el of sorted) {
      if (el.type !== "image" || !el.src) continue;
      if (!imgs.has(el.src)) {
        imgs.set(el.src, await loadImage(el.src).catch(() => null));
      }
    }

    for (const el of sorted) {
      ctx.save();
      ctx.translate(el.x, el.y);
      if (el.type === "image") {
        const img = el.src ? imgs.get(el.src) : null;
        if (img) {
          ctx.drawImage(img, 0, 0, el.w, el.h);
        } else {
          // 加载失败的占位(远程图被 CORS 拦截时)
          ctx.strokeStyle = "#bbb";
          ctx.strokeRect(0.5, 0.5, el.w - 1, el.h - 1);
          ctx.fillStyle = "#bbb";
          ctx.fillText("图片加载失败", 8, el.h / 2);
        }
      } else {
        drawWrappedText(ctx, el.text ?? "", el.w, el.h);
      }
      ctx.restore();
    }

    let url: string;
    try {
      url = cv.toDataURL("image/png");
    } catch {
      // 画布被跨域图污染 → toDataURL 抛 SecurityError
      message.warning("远程图片不允许跨域,无法导出;请改用本地插入的图片");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `word-canvas-${Date.now()}.png`;
    document.body.appendChild(a); // Firefox 需要入文档才生效
    a.click();
    a.remove();
    message.success("已导出 PNG");
  } finally {
    exporting.value = false;
  }
}

function printDoc() {
  // 打印前取消选中/编辑态,避免手柄、蓝框进纸面(样式里也有兜底)
  deselect();
  window.print();
}
</script>

<template>
  <div class="canvas-page">
    <!-- 工具栏 -->
    <div class="canvas-toolbar no-print">
      <a-button-group size="small">
        <a-button @click="addText()">插入文本框</a-button>
        <a-button @click="fileInput?.click()">插入图片</a-button>
        <a-button @click="insertImageUrl">图片URL</a-button>
      </a-button-group>
      <a-button-group size="small">
        <a-button :disabled="!selected" @click="removeSelected">删除选中</a-button>
        <a-button :disabled="!selected" @click="bringForward">置于顶层</a-button>
        <a-button :disabled="!selected" @click="sendBackward">置于底层</a-button>
      </a-button-group>
      <a-space size="8">
        <span class="tip-label">网格吸附</span>
        <a-switch v-model:checked="snapEnabled" size="small" />
      </a-space>
      <a-button size="small" danger @click="clearAll">清空</a-button>
      <a-divider type="vertical" />
      <a-button size="small" @click="exportJson">导出 JSON</a-button>
      <a-button size="small" :loading="exporting" @click="exportImage">导出图片</a-button>
      <a-button size="small" @click="printDoc">打印</a-button>
      <input ref="fileInput" type="file" accept="image/*" hidden @change="onPickFile" />
    </div>

    <div class="canvas-hint no-print">
      单击选中 · 拖空白处移动 · 拖 8 个手柄缩放 · 双击文本框编辑 · Delete 删除 · 方向键微调(Shift 加速 / 临时关闭吸附)· 可从系统直接拖入图片
    </div>

    <!-- 纸张画布 -->
    <div class="canvas-scroll">
      <div
        ref="canvasEl"
        class="word-canvas"
        :class="{ snapping: snapEnabled }"
        @pointerdown.self="deselect"
        @dragover.prevent
        @drop="onCanvasDrop"
      >
        <div
          v-for="el in elements"
          :key="el.id"
          class="canvas-el"
          :class="{ selected: el.id === selectedId, editing: el.id === editingId }"
          :style="{ left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px', zIndex: el.z }"
          @pointerdown="beginDrag($event, el, 'move')"
          @dblclick="enterEdit(el)"
        >
          <!-- 文本元素:编辑态用 textarea,常态渲染纯文本 -->
          <template v-if="el.type === 'text'">
            <textarea
              v-if="el.id === editingId"
              v-model="el.text"
              class="text-edit"
              autofocus
              @blur="exitEdit"
              @pointerdown.stop
            />
            <div v-else class="text-view">{{ el.text }}</div>
          </template>

          <!-- 图片元素 -->
          <img
            v-else
            :src="el.src"
            class="img-view"
            draggable="false"
            alt=""
          />

          <!-- 选中时的 8 个缩放手柄 -->
          <template v-if="el.id === selectedId">
            <span
              v-for="dir in HANDLES"
              :key="dir"
              class="resize-handle"
              :style="handleStyle(dir)"
              @pointerdown="beginDrag($event, el, 'resize', dir)"
            />
          </template>
        </div>
      </div>
    </div>

    <a-modal v-model:open="showJson" title="画布数据(JSON)" width="640px" :footer="null">
      <pre class="json-output">{{ jsonOutput }}</pre>
    </a-modal>
  </div>
</template>

<style scoped>
.canvas-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 110px);
}

.canvas-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  margin-bottom: 6px;
}

.canvas-hint {
  font-size: 12px;
  color: #888;
  margin: 0 4px 8px;
}

.canvas-scroll {
  flex: 1;
  overflow: auto;
  padding: 16px 0 48px;
}

/* A4 纸张画布:绝对定位元素的包含块 */
.word-canvas {
  width: 794px;
  min-height: 1123px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  overflow: hidden;
  user-select: none;
}

/* 网格点背景(24px 间隔,视觉上配合 8px 吸附) */
.word-canvas.snapping {
  background-image: radial-gradient(#d7d7d7 1px, transparent 1px);
  background-size: 24px 24px;
}

.canvas-el {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed transparent;
  cursor: move;
}

.canvas-el:hover {
  border-color: #b7cdea;
}

.canvas-el.selected {
  border-color: #1677ff;
}

.canvas-el.editing {
  cursor: text;
  user-select: text;
}

.text-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.7;
  padding: 4px 6px;
}

.text-edit {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.7;
  padding: 4px 6px;
  background: #fffef0;
}

.img-view {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  background: #fff;
  border: 2px solid #1677ff;
  border-radius: 1px;
  z-index: 10;
}

.json-output {
  max-height: 420px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

@media print {
  .no-print {
    display: none !important;
  }
  .canvas-scroll {
    overflow: visible;
    padding: 0;
  }
  .word-canvas {
    width: auto;
    min-height: auto;
    box-shadow: none;
    background-image: none; /* 去掉网格点 */
  }
  /* 选中态/悬停边框与手柄不带入纸面 */
  .canvas-el,
  .canvas-el:hover,
  .canvas-el.selected {
    border-color: transparent !important;
  }
  .resize-handle {
    display: none !important;
  }
}
</style>
