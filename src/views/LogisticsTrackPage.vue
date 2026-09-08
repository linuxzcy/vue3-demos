<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { CarOutlined, EnvironmentOutlined } from '@ant-design/icons-vue'
import { loadAmap } from '../utils/amap'
import {
  MOCK_LOGISTICS_ORDER,
  MOCK_LOGISTICS_TIMELINE,
  pathDistanceMeters,
  splitPathByProgress,
} from '../utils/logisticsTrack'

const mapContainer = ref<HTMLDivElement | null>(null)
const mapReady = ref(false)
const loadError = ref('')
const apiKeyHint = !import.meta.env.VITE_AMAP_KEY

let AMap: any = null
let map: any = null
let traveledLine: any = null
let remainingLine: any = null
let startMarker: any = null
let endMarker: any = null
let truckMarker: any = null

const order = MOCK_LOGISTICS_ORDER
const timeline = MOCK_LOGISTICS_TIMELINE

const pathParts = computed(() =>
  splitPathByProgress(order.fullPath, order.currentIndex),
)

const remainKm = computed(() => {
  const m = pathDistanceMeters(pathParts.value.remaining)
  return (m / 1000).toFixed(1)
})

const progressPct = computed(() => {
  const total = Math.max(order.fullPath.length - 1, 1)
  return Math.round((order.currentIndex / total) * 100)
})

async function initMap() {
  try {
    AMap = await loadAmap()
    if (!mapContainer.value) return

    map = new AMap.Map(mapContainer.value, {
      zoom: 9,
      center: pathParts.value.current,
      viewMode: '2D',
      mapStyle: 'amap://styles/normal',
    })
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: { right: '12px', bottom: '24px' } }))

    drawTrack()
    mapReady.value = true
  } catch (e: any) {
    loadError.value = e?.message || '地图加载失败'
    message.error(loadError.value)
  }
}

function drawTrack() {
  if (!map || !AMap) return

  const { traveled, remaining, current } = pathParts.value
  const start = order.fullPath[0]
  const end = order.fullPath[order.fullPath.length - 1]

  remainingLine = new AMap.Polyline({
    path: remaining,
    strokeColor: '#fa8c16',
    strokeWeight: 6,
    strokeOpacity: 0.75,
    strokeStyle: 'dashed',
    lineJoin: 'round',
    zIndex: 40,
  })

  traveledLine = new AMap.Polyline({
    path: traveled,
    strokeColor: '#1677ff',
    strokeWeight: 6,
    strokeOpacity: 0.95,
    lineJoin: 'round',
    showDir: true,
    zIndex: 50,
  })

  startMarker = new AMap.Marker({
    position: start,
    content: `<div class="track-pin start">起</div>`,
    offset: new AMap.Pixel(-14, -14),
    zIndex: 80,
  })

  endMarker = new AMap.Marker({
    position: end,
    content: `<div class="track-pin end">终</div>`,
    offset: new AMap.Pixel(-14, -14),
    zIndex: 80,
  })

  truckMarker = new AMap.Marker({
    position: current,
    content: `<div class="track-truck">🚚</div>`,
    offset: new AMap.Pixel(-16, -16),
    zIndex: 120,
  })

  map.add([remainingLine, traveledLine, startMarker, endMarker, truckMarker])
  map.setFitView([traveledLine, remainingLine], false, [48, 48, 48, 48])
}

function destroyMap() {
  if (map) {
    map.destroy()
    map = null
  }
  traveledLine = remainingLine = startMarker = endMarker = truckMarker = null
  AMap = null
}

onMounted(() => {
  if (!apiKeyHint) initMap()
})

onBeforeUnmount(destroyMap)
</script>

<template>
  <div class="logistics-page">
    <div class="page-head">
      <div>
        <h2>物流轨迹</h2>
        <p class="sub">
          {{ order.carrier }} · {{ order.trackingNo }} ·
          <span class="status">{{ order.statusText }}</span>
        </p>
      </div>
      <div class="meta">
        <span><EnvironmentOutlined /> {{ order.startName }} → {{ order.endName }}</span>
        <span><CarOutlined /> 距目的地约 {{ remainKm }} km · 进度 {{ progressPct }}%</span>
      </div>
    </div>

    <a-alert
      v-if="apiKeyHint"
      type="warning"
      show-icon
      message="请在项目根目录 .env 配置 VITE_AMAP_KEY（及可选 VITE_AMAP_SECURITY_CODE）后刷新"
      style="margin-bottom: 12px"
    />
    <a-alert
      v-else-if="loadError"
      type="error"
      show-icon
      :message="loadError"
      style="margin-bottom: 12px"
    />

    <!-- 上：地图轨迹 -->
    <div class="map-panel">
      <div ref="mapContainer" class="map-el" />
      <div class="legend">
        <span><i class="dot blue" />已行驶</span>
        <span><i class="dot orange" />未行驶</span>
        <span>🚚 当前位置</span>
      </div>
    </div>

    <!-- 下：阶段时间轴 -->
    <div class="timeline-panel">
      <h3>物流详情</h3>
      <a-timeline>
        <a-timeline-item
          v-for="item in timeline"
          :key="item.id"
          :color="item.active ? 'blue' : 'gray'"
        >
          <div class="tl-item" :class="{ active: item.active }">
            <div class="tl-time">{{ item.time }}</div>
            <div class="tl-title">{{ item.title }}</div>
            <div class="tl-desc">{{ item.desc }}</div>
          </div>
        </a-timeline-item>
      </a-timeline>
    </div>
  </div>
</template>

<style scoped>
.logistics-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px 0 32px;
}

.page-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.page-head h2 {
  margin: 0;
  font-size: 20px;
}

.sub {
  margin: 4px 0 0;
  color: #666;
  font-size: 13px;
}

.status {
  color: #1677ff;
  font-weight: 600;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #444;
  text-align: right;
}

.map-panel {
  position: relative;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.map-el {
  width: 100%;
  height: min(48vh, 420px);
  min-height: 280px;
  background: #e8eef5;
}

.legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 12px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  font-size: 12px;
  color: #333;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.legend .dot {
  display: inline-block;
  width: 14px;
  height: 3px;
  margin-right: 4px;
  vertical-align: middle;
  border-radius: 1px;
}

.legend .dot.blue {
  background: #1677ff;
}

.legend .dot.orange {
  background: #fa8c16;
  background-image: repeating-linear-gradient(
    90deg,
    #fa8c16 0 4px,
    transparent 4px 7px
  );
}

.timeline-panel {
  margin-top: 16px;
  padding: 16px 20px 8px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.timeline-panel h3 {
  margin: 0 0 16px;
  font-size: 16px;
}

.tl-item.active .tl-title {
  color: #1677ff;
  font-weight: 600;
}

.tl-time {
  font-size: 12px;
  color: #999;
  margin-bottom: 2px;
}

.tl-title {
  font-size: 14px;
  color: #222;
}

.tl-desc {
  margin-top: 2px;
  font-size: 13px;
  color: #666;
}
</style>

<!-- 高德 Marker 自定义 DOM（挂到地图容器外，需全局类名） -->
<style>
.track-pin {
  width: 28px;
  height: 28px;
  line-height: 28px;
  text-align: center;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.track-pin.start {
  background: #1677ff;
}

.track-pin.end {
  background: #cf1322;
}

.track-truck {
  font-size: 28px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
}
</style>
