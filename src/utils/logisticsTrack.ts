/** 物流轨迹演示数据（Web / UniApp 共用结构） */

export type LngLat = [number, number]

export interface LogisticsOrder {
  trackingNo: string
  carrier: string
  statusText: string
  /** 全程轨迹（起点 → 终点） */
  fullPath: LngLat[]
  /** 当前进度索引（已行驶到 fullPath[currentIndex]） */
  currentIndex: number
  /** 起点 / 终点展示名 */
  startName: string
  endName: string
}

export interface LogisticsTimelineItem {
  id: string
  time: string
  title: string
  desc: string
  /** 是否当前最新节点 */
  active?: boolean
}

/** 上海 → 南京一带模拟轨迹 */
export const LOGISTICS_FULL_PATH: LngLat[] = [
  [121.473701, 31.230416], // 上海
  [121.352, 31.221],
  [121.18, 31.25],
  [121.05, 31.3],
  [120.985, 31.3], // 昆山
  [120.62, 31.32], // 苏州
  [120.35, 31.48],
  [120.31, 31.57], // 无锡（当前）
  [119.95, 31.78],
  [119.45, 32.05],
  [118.796877, 32.060255], // 南京
]

/** 当前停在无锡枢纽附近 */
export const LOGISTICS_CURRENT_INDEX = 7

export const MOCK_LOGISTICS_ORDER: LogisticsOrder = {
  trackingNo: 'SF1234567890',
  carrier: '顺丰速运',
  statusText: '运输中',
  fullPath: LOGISTICS_FULL_PATH,
  currentIndex: LOGISTICS_CURRENT_INDEX,
  startName: '上海转运中心',
  endName: '南京派送站',
}

/** 时间轴：最新在上 */
export const MOCK_LOGISTICS_TIMELINE: LogisticsTimelineItem[] = [
  {
    id: '6',
    time: '2026-09-08 16:10',
    title: '【无锡市】已到达无锡枢纽',
    desc: '快件已到达无锡转运中心，正在发往南京方向',
    active: true,
  },
  {
    id: '5',
    time: '2026-09-08 13:40',
    title: '【苏州市】已离开苏州中转',
    desc: '快件已发出，下一站无锡枢纽',
  },
  {
    id: '4',
    time: '2026-09-08 11:05',
    title: '【昆山市】已到达昆山分拨',
    desc: '快件已到达昆山分拨中心',
  },
  {
    id: '3',
    time: '2026-09-08 09:30',
    title: '【上海市】运输中',
    desc: '快件正发往昆山分拨中心',
  },
  {
    id: '2',
    time: '2026-09-08 08:20',
    title: '【上海市】已揽收',
    desc: '快递员已取件，快件到达上海转运中心',
  },
  {
    id: '1',
    time: '2026-09-08 07:55',
    title: '运单已创建',
    desc: '商家已下单，等待揽收',
  },
]

export function splitPathByProgress(path: LngLat[], currentIndex: number) {
  const idx = Math.max(0, Math.min(currentIndex, path.length - 1))
  const traveled = path.slice(0, idx + 1)
  const remaining = path.slice(idx)
  return { traveled, remaining, current: path[idx] }
}

/** 简易球面距离（米），用于展示剩余距离文案 */
export function pathDistanceMeters(path: LngLat[]): number {
  if (path.length < 2) return 0
  let sum = 0
  for (let i = 1; i < path.length; i++) {
    sum += haversine(path[i - 1], path[i])
  }
  return sum
}

function haversine(a: LngLat, b: LngLat): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
