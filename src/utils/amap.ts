import AMapLoader from '@amap/amap-jsapi-loader'

export type AMapNS = typeof window.AMap

declare global {
  interface Window {
    AMap: any
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

let amapPromise: Promise<any> | null = null

/** 加载高德 JSAPI 2.0（需在 .env 配置 VITE_AMAP_KEY） */
export function loadAmap(plugins: string[] = []): Promise<any> {
  const key = import.meta.env.VITE_AMAP_KEY as string
  const security = import.meta.env.VITE_AMAP_SECURITY_CODE as string

  if (!key) {
    return Promise.reject(new Error('缺少 VITE_AMAP_KEY，请在项目根目录 .env 中配置高德 Key'))
  }

  if (security) {
    window._AMapSecurityConfig = { securityJsCode: security }
  }

  if (!amapPromise) {
    amapPromise = AMapLoader.load({
      key,
      version: '2.0',
      plugins: [
        'AMap.Scale',
        'AMap.ToolBar',
        'AMap.ControlBar',
        'AMap.PlaceSearch',
        'AMap.AutoComplete',
        'AMap.Geocoder',
        'AMap.Driving',
        'AMap.MoveAnimation',
        'AMap.ContextMenu',
        ...plugins,
      ],
    })
  }

  return amapPromise
}

/** 模拟物流轨迹点（上海 → 苏州 → 无锡 → 南京 一带） */
export const MOCK_LOGISTICS_PATH: [number, number][] = [
  [121.473701, 31.230416], // 上海
  [121.352, 31.221],
  [121.18, 31.25],
  [121.05, 31.3],
  [120.985, 31.3], // 昆山附近
  [120.62, 31.32], // 苏州
  [120.35, 31.48],
  [120.31, 31.57], // 无锡
  [119.95, 31.78],
  [119.45, 32.05],
  [118.796877, 32.060255], // 南京
]

export const MOCK_LOGISTICS_NODES = [
  { name: '上海转运中心', lng: 121.473701, lat: 31.230416, time: '08:20', status: '已揽收' },
  { name: '昆山分拨', lng: 120.985, lat: 31.3, time: '11:05', status: '运输中' },
  { name: '苏州中转', lng: 120.62, lat: 31.32, time: '13:40', status: '运输中' },
  { name: '无锡枢纽', lng: 120.31, lat: 31.57, time: '16:10', status: '运输中' },
  { name: '南京派送站', lng: 118.796877, lat: 32.060255, time: '20:30', status: '派送中' },
]
