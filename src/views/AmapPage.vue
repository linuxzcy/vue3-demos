<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  EnvironmentOutlined,
  SearchOutlined,
  CarOutlined,
  AimOutlined,
} from '@ant-design/icons-vue'
import {
  loadAmap,
  MOCK_LOGISTICS_NODES,
  MOCK_LOGISTICS_PATH,
} from '../utils/amap'

const mapContainer = ref<HTMLDivElement | null>(null)
const mapReady = ref(false)
const loadError = ref('')
const apiKeyHint = !import.meta.env.VITE_AMAP_KEY

let AMap: any = null
let map: any = null
let placeSearch: any = null
let autoComplete: any = null
let geocoder: any = null
let contextMenu: any = null
let selectMarker: any = null
let startMarker: any = null
let endMarker: any = null
let routePolyline: any = null
let logisticsPolyline: any = null
let logisticsMarkers: any[] = []
let truckMarker: any = null
let driving: any = null

const searchKeyword = ref('')
const searchTips = ref<{ name: string; district: string; location?: any; address?: string }[]>([])
const tipOpen = ref(false)
const poiResults = ref<
  { id: string; name: string; address: string; lng: number; lat: number; tel?: string; type?: string }[]
>([])
const navSteps = ref<{ instruction: string; distance: number; time: number; road?: string }[]>([])

const selected = reactive({
  lng: null as number | null,
  lat: null as number | null,
  address: '',
})

const routeForm = reactive({
  start: '上海站',
  end: '南京南站',
})
const routeInfo = ref('')
const logisticsPlaying = ref(false)
const logisticsProgress = ref(0)

const selectedText = computed(() => {
  if (selected.lng == null || selected.lat == null) return '尚未选择位置（右键地图 → 选择位置）'
  return `经度 ${selected.lng.toFixed(6)}　纬度 ${selected.lat.toFixed(6)}`
})

async function initMap() {
  try {
    AMap = await loadAmap()
    if (!mapContainer.value) return

    map = new AMap.Map(mapContainer.value, {
      zoom: 11,
      center: [121.473701, 31.230416],
      viewMode: '3D',
      mapStyle: 'amap://styles/normal',
    })

    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: { right: '16px', bottom: '80px' } }))

    geocoder = new AMap.Geocoder({ city: '全国' })
    // map 不自动打点，由我们自己展示详细 POI 列表与经纬度
    placeSearch = new AMap.PlaceSearch({ city: '全国', pageSize: 10 })
    autoComplete = new AMap.AutoComplete({ city: '全国' })
    driving = new AMap.Driving({ map: null, policy: AMap.DrivingPolicy.LEAST_TIME })

    setupContextMenu()
    mapReady.value = true
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

function setupContextMenu() {
  contextMenu = new AMap.ContextMenu()

  contextMenu.addItem(
    '放大一级',
    () => {
      map.zoomIn()
      contextMenu.close()
    },
    0,
  )
  contextMenu.addItem(
    '缩小一级',
    () => {
      map.zoomOut()
      contextMenu.close()
    },
    1,
  )
  contextMenu.addItem(
    '选择位置',
    () => {
      const { lng, lat } = contextMenu._rightClickLngLat || map.getCenter()
      pickLocation(lng, lat)
      contextMenu.close()
    },
    2,
  )
  contextMenu.addItem(
    '设为路线起点',
    () => {
      const p = contextMenu._rightClickLngLat
      if (p) setRoutePoint('start', p.lng, p.lat)
      contextMenu.close()
    },
    3,
  )
  contextMenu.addItem(
    '设为路线终点',
    () => {
      const p = contextMenu._rightClickLngLat
      if (p) setRoutePoint('end', p.lng, p.lat)
      contextMenu.close()
    },
    4,
  )

  map.on('rightclick', (e: any) => {
    contextMenu._rightClickLngLat = e.lnglat
    contextMenu.open(map, e.lnglat)
  })
}

function pickLocation(lng: number, lat: number) {
  selected.lng = lng
  selected.lat = lat
  selected.address = '解析中...'

  if (selectMarker) map.remove(selectMarker)
  selectMarker = new AMap.Marker({
    position: [lng, lat],
    title: '选中位置',
    animation: 'AMAP_ANIMATION_DROP',
  })
  map.add(selectMarker)
  map.setCenter([lng, lat])

  geocoder.getAddress([lng, lat], (status: string, result: any) => {
    if (status === 'complete' && result.regeocode) {
      selected.address = result.regeocode.formattedAddress
    } else {
      selected.address = '地址解析失败'
    }
  })

  message.success(`已选择：${lng.toFixed(6)}, ${lat.toFixed(6)}`)
}

function setRoutePoint(type: 'start' | 'end', lng: number, lat: number) {
  const marker = new AMap.Marker({
    position: [lng, lat],
    label: {
      content: type === 'start' ? '起点' : '终点',
      direction: 'top',
    },
  })
  if (type === 'start') {
    if (startMarker) map.remove(startMarker)
    startMarker = marker
    routeForm.start = `${lng.toFixed(5)},${lat.toFixed(5)}`
  } else {
    if (endMarker) map.remove(endMarker)
    endMarker = marker
    routeForm.end = `${lng.toFixed(5)},${lat.toFixed(5)}`
  }
  map.add(marker)
}

function onSearchInput() {
  const kw = searchKeyword.value.trim()
  if (!kw || !autoComplete) {
    searchTips.value = []
    tipOpen.value = false
    return
  }
  autoComplete.search(kw, (status: string, result: any) => {
    if (status === 'complete' && result.tips) {
      searchTips.value = result.tips.filter((t: any) => t.name)
      tipOpen.value = searchTips.value.length > 0
    } else {
      searchTips.value = []
      tipOpen.value = false
    }
  })
}

function selectTip(tip: { name: string; district: string; location?: any }) {
  searchKeyword.value = tip.name
  tipOpen.value = false
  if (tip.location) {
    const lng = tip.location.lng
    const lat = tip.location.lat
    pickLocation(lng, lat)
    map.setZoom(15)
    // 联想结果也补一条详情，方便看经纬度
    poiResults.value = [
      {
        id: `tip-${lng}-${lat}`,
        name: tip.name,
        address: `${tip.district || ''}`.trim() || tip.name,
        lng,
        lat,
      },
    ]
  } else {
    doPlaceSearch()
  }
}

function doPlaceSearch() {
  const kw = searchKeyword.value.trim()
  if (!kw || !placeSearch) return
  tipOpen.value = false
  placeSearch.search(kw, (status: string, result: any) => {
    if (status === 'complete' && result.poiList?.pois?.length) {
      poiResults.value = result.poiList.pois.map((poi: any) => ({
        id: poi.id,
        name: poi.name,
        address: poi.address || poi.pname + poi.cityname + poi.adname,
        lng: poi.location.lng,
        lat: poi.location.lat,
        tel: poi.tel,
        type: poi.type,
      }))
      // 默认选中第一条，并把经纬度渲染到页面
      const first = poiResults.value[0]
      pickLocation(first.lng, first.lat)
      map.setZoom(15)
      message.success(`找到 ${poiResults.value.length} 个详细位置`)
    } else {
      poiResults.value = []
      message.warning('未找到相关地点')
    }
  })
}

function selectPoi(poi: { name: string; address: string; lng: number; lat: number }) {
  searchKeyword.value = poi.name
  pickLocation(poi.lng, poi.lat)
  map.setZoom(16)
}

/** 把当前选中点设为导航起点/终点 */
function useSelectedAs(type: 'start' | 'end') {
  if (selected.lng == null || selected.lat == null) {
    message.warning('请先搜索或右键选择位置')
    return
  }
  setRoutePoint(type, selected.lng, selected.lat)
  message.success(type === 'start' ? '已设为起点' : '已设为终点')
}

function parsePoint(input: string): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    const coord = input.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/)
    if (coord) {
      resolve([Number(coord[1]), Number(coord[2])])
      return
    }
    geocoder.getLocation(input, (status: string, result: any) => {
      if (status === 'complete' && result.geocodes?.length) {
        const loc = result.geocodes[0].location
        resolve([loc.lng, loc.lat])
      } else {
        resolve(null)
      }
    })
  })
}

async function planRoute() {
  if (!driving) return
  const start = await parsePoint(routeForm.start)
  const end = await parsePoint(routeForm.end)
  if (!start || !end) {
    message.error('起点或终点无法解析，请输入地名或「经度,纬度」')
    return
  }

  clearRoute()
  setRoutePoint('start', start[0], start[1])
  setRoutePoint('end', end[0], end[1])

  driving.search(start, end, (status: string, result: any) => {
    if (status !== 'complete' || !result.routes?.length) {
      message.error('路线规划失败')
      routeInfo.value = ''
      return
    }
    const route = result.routes[0]
    const path: [number, number][] = []
    route.steps.forEach((step: any) => {
      step.path.forEach((p: any) => path.push([p.lng, p.lat]))
    })

    routePolyline = new AMap.Polyline({
      path,
      strokeColor: '#1677ff',
      strokeWeight: 6,
      strokeOpacity: 0.85,
      lineJoin: 'round',
      zIndex: 50,
    })
    map.add(routePolyline)
    map.setFitView([routePolyline, startMarker, endMarker])

    const km = (route.distance / 1000).toFixed(1)
    const min = Math.round(route.time / 60)
    routeInfo.value = `驾车约 ${km} 公里 · 预计 ${min} 分钟`

    // 导航步骤（详细路线指引）
    navSteps.value = (route.steps || []).map((step: any) => ({
      instruction: step.instruction || step.road || '行驶',
      distance: step.distance || 0,
      time: step.time || 0,
      road: step.road,
    }))

    message.success('路线轨迹与导航步骤已生成')
  })
}

function clearRoute() {
  if (routePolyline) {
    map.remove(routePolyline)
    routePolyline = null
  }
  routeInfo.value = ''
  navSteps.value = []
}

function clearLogistics() {
  if (truckMarker?.stopMove) truckMarker.stopMove()
  if (logisticsPolyline) map.remove(logisticsPolyline)
  logisticsMarkers.forEach((m) => map.remove(m))
  if (truckMarker) map.remove(truckMarker)
  logisticsPolyline = null
  logisticsMarkers = []
  truckMarker = null
  logisticsPlaying.value = false
  logisticsProgress.value = 0
}

function drawLogisticsTrack() {
  if (!map) return
  clearLogistics()

  logisticsPolyline = new AMap.Polyline({
    path: MOCK_LOGISTICS_PATH,
    strokeColor: '#fa8c16',
    strokeWeight: 5,
    strokeOpacity: 0.9,
    showDir: true,
    zIndex: 40,
  })
  map.add(logisticsPolyline)

  logisticsMarkers = MOCK_LOGISTICS_NODES.map(
    (node) =>
      new AMap.Marker({
        position: [node.lng, node.lat],
        content: `<div class="logistics-node">${node.name}</div>`,
        offset: new AMap.Pixel(-40, -36),
      }),
  )
  map.add(logisticsMarkers)

  truckMarker = new AMap.Marker({
    position: MOCK_LOGISTICS_PATH[0],
    content:
      '<div class="truck-icon">🚚</div>',
    offset: new AMap.Pixel(-14, -14),
    zIndex: 120,
  })
  map.add(truckMarker)
  map.setFitView([logisticsPolyline])
  message.success('物流轨迹已绘制')
}

function playLogistics() {
  if (!truckMarker) drawLogisticsTrack()
  if (!truckMarker || logisticsPlaying.value) return

  logisticsPlaying.value = true
  const path = MOCK_LOGISTICS_PATH.map((p) => new AMap.LngLat(p[0], p[1]))
  const duration = 12000

  truckMarker.moveAlong(path, {
    duration,
    autoRotation: true,
  })

  const start = Date.now()
  const timer = setInterval(() => {
    const p = Math.min(100, ((Date.now() - start) / duration) * 100)
    logisticsProgress.value = Math.round(p)
    if (p >= 100) {
      clearInterval(timer)
      logisticsPlaying.value = false
      message.success('快递已到达南京派送站')
    }
  }, 200)
}

function stopLogistics() {
  if (truckMarker?.stopMove) truckMarker.stopMove()
  logisticsPlaying.value = false
}

onMounted(initMap)

onBeforeUnmount(() => {
  stopLogistics()
  map?.destroy()
  map = null
})
</script>

<template>
  <div class="amap-page">
    <a-row :gutter="16">
      <a-col :xs="24" :lg="8">
        <a-card title="搜索地点" size="small">
          <a-alert
            v-if="apiKeyHint"
            type="warning"
            show-icon
            style="margin-bottom: 12px"
            message="请配置高德 Key"
            description="在项目根目录创建 .env，写入 VITE_AMAP_KEY 与 VITE_AMAP_SECURITY_CODE（控制台申请），然后重启 npm run dev。"
          />
          <a-alert
            v-if="loadError"
            type="error"
            show-icon
            style="margin-bottom: 12px"
            :message="loadError"
          />

          <div class="search-box">
            <a-input-search
              v-model:value="searchKeyword"
              placeholder="搜索小区、写字楼、详细地址..."
              enter-button="搜索"
              :disabled="!mapReady"
              @search="doPlaceSearch"
              @change="onSearchInput"
            >
              <template #prefix><SearchOutlined /></template>
            </a-input-search>
            <div v-if="tipOpen" class="tips">
              <div
                v-for="(tip, i) in searchTips"
                :key="i"
                class="tip-item"
                @click="selectTip(tip)"
              >
                <div class="tip-name">{{ tip.name }}</div>
                <div class="tip-dist">{{ tip.district }} {{ tip.address || '' }}</div>
              </div>
            </div>
          </div>

          <div v-if="poiResults.length" class="poi-list">
            <div class="poi-title">详细搜索结果（含经纬度）</div>
            <div
              v-for="poi in poiResults"
              :key="poi.id"
              class="poi-item"
              @click="selectPoi(poi)"
            >
              <div class="tip-name">{{ poi.name }}</div>
              <div class="tip-dist">{{ poi.address }}</div>
              <div class="coord">{{ poi.lng.toFixed(6) }}, {{ poi.lat.toFixed(6) }}</div>
            </div>
          </div>
        </a-card>

        <a-card title="选中位置 / 经纬度" size="small" class="mt">
          <a-descriptions :column="1" size="small" bordered>
            <a-descriptions-item label="经纬度">
              <span class="coord">{{ selectedText }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="地址">
              {{ selected.address || '-' }}
            </a-descriptions-item>
          </a-descriptions>
          <a-space wrap style="margin-top: 8px">
            <a-button size="small" :disabled="!mapReady" @click="useSelectedAs('start')">设为导航起点</a-button>
            <a-button size="small" :disabled="!mapReady" @click="useSelectedAs('end')">设为导航终点</a-button>
          </a-space>
          <p class="hint">
            <AimOutlined /> 搜索选点 / 右键「选择位置」都会回填经纬度
          </p>
        </a-card>

        <a-card title="路线规划 + 导航步骤" size="small" class="mt">
          <a-form layout="vertical" size="small">
            <a-form-item label="起点">
              <a-input v-model:value="routeForm.start" placeholder="地名或 经度,纬度" />
            </a-form-item>
            <a-form-item label="终点">
              <a-input v-model:value="routeForm.end" placeholder="地名或 经度,纬度" />
            </a-form-item>
          </a-form>
          <a-space wrap>
            <a-button type="primary" :disabled="!mapReady" @click="planRoute">
              <CarOutlined /> 规划路线 / 导航
            </a-button>
            <a-button :disabled="!mapReady" @click="clearRoute">清除路线</a-button>
          </a-space>
          <p v-if="routeInfo" class="route-info">{{ routeInfo }}</p>
          <div v-if="navSteps.length" class="nav-steps">
            <div class="poi-title">导航指引</div>
            <ol>
              <li v-for="(step, i) in navSteps" :key="i">
                {{ step.instruction }}
                <span class="tip-dist">
                  （{{ (step.distance / 1000).toFixed(2) }} km）
                </span>
              </li>
            </ol>
          </div>
        </a-card>
        <a-card title="物流快递轨迹" size="small" class="mt">
          <a-timeline>
            <a-timeline-item
              v-for="node in MOCK_LOGISTICS_NODES"
              :key="node.name"
              :color="node.status === '已揽收' ? 'green' : node.status === '派送中' ? 'blue' : 'gray'"
            >
              <strong>{{ node.status }}</strong> · {{ node.name }}
              <div class="node-time">{{ node.time }}</div>
            </a-timeline-item>
          </a-timeline>
          <a-progress :percent="logisticsProgress" size="small" style="margin-bottom: 8px" />
          <a-space wrap>
            <a-button type="primary" :disabled="!mapReady" @click="drawLogisticsTrack">
              绘制轨迹
            </a-button>
            <a-button
              :disabled="!mapReady || logisticsPlaying"
              @click="playLogistics"
            >
              播放快递移动
            </a-button>
            <a-button :disabled="!logisticsPlaying" @click="stopLogistics">暂停</a-button>
            <a-button danger :disabled="!mapReady" @click="clearLogistics">清除</a-button>
          </a-space>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="16">
        <a-card size="small" title="高德地图">
          <template #extra>
            <a-tag :color="mapReady ? 'success' : 'default'">
              <EnvironmentOutlined />
              {{ mapReady ? '地图就绪' : '加载中...' }}
            </a-tag>
          </template>
          <div ref="mapContainer" class="map-box" />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.amap-page {
  padding: 16px 0;
}

.mt {
  margin-top: 12px;
}

.search-box {
  position: relative;
}

.tips {
  position: absolute;
  left: 0;
  right: 0;
  top: 40px;
  z-index: 20;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  max-height: 240px;
  overflow: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.tip-item {
  padding: 8px 12px;
  cursor: pointer;
}

.tip-item:hover {
  background: #f5f5f5;
}

.tip-name {
  font-weight: 600;
}

.tip-dist {
  font-size: 12px;
  color: #999;
}

.poi-list {
  margin-top: 12px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
}

.poi-title {
  font-size: 12px;
  color: #666;
  padding: 8px 10px 4px;
  font-weight: 600;
}

.poi-item {
  padding: 8px 10px;
  border-top: 1px solid #f5f5f5;
  cursor: pointer;
}

.poi-item:hover {
  background: #f5faff;
}

.nav-steps {
  margin-top: 10px;
  max-height: 200px;
  overflow: auto;
  background: #fafafa;
  border-radius: 8px;
  padding: 4px 8px 8px;
}

.nav-steps ol {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  line-height: 1.6;
}

.coord {
  color: #1677ff;
  font-family: ui-monospace, monospace;
  word-break: break-all;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #888;
}

.route-info {
  margin: 10px 0 0;
  color: #1677ff;
  font-weight: 600;
}

.node-time {
  font-size: 12px;
  color: #999;
}

.map-box {
  width: 100%;
  height: 720px;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.logistics-node) {
  background: #fff;
  border: 1px solid #fa8c16;
  color: #d46b08;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

:deep(.truck-icon) {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}
</style>
