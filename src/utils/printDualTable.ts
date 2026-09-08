export type PaperOrientation = 'portrait' | 'landscape'

export interface TableRow {
  id: number
  name: string
  remark: string
}

export interface PagePair<T> {
  left: T[]
  right: T[]
}

/** A4 尺寸（mm） */
export const A4_MM = { width: 210, height: 297 } as const

export const DEFAULT_MARGIN_MM = 12
export const DEFAULT_GAP_MM = 8

const REMARK_SAMPLES = [
  '常规备注。',
  '本行备注较短。',
  '该行备注内容偏长，用于模拟单元格自动换行后行高不一致的情况，打印时不应出现半行被截断。',
  '含多段说明：\n1. 检查包装\n2. 核对数量\n3. 确认收货地址与联系人信息是否完整。',
  '紧急：请优先处理；若库存不足请在备注栏回写替代方案，并同步采购与仓储。',
  '跨页压测用长文本：'.padEnd(120, '测') + '结束。',
]

export function createMockRows(count: number): TableRow[] {
  const n = Math.max(0, Math.floor(count))
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `物料-${String(i + 1).padStart(3, '0')}`,
    remark: REMARK_SAMPLES[i % REMARK_SAMPLES.length],
  }))
}

/** 按行数均分：左侧多拿 1 行（总数为奇数时） */
export function splitEvenly<T>(rows: T[]): { left: T[]; right: T[] } {
  const mid = Math.ceil(rows.length / 2)
  return {
    left: rows.slice(0, mid),
    right: rows.slice(mid),
  }
}

export function getPageSizeMm(orientation: PaperOrientation): {
  width: number
  height: number
} {
  if (orientation === 'landscape') {
    return { width: A4_MM.height, height: A4_MM.width }
  }
  return { width: A4_MM.width, height: A4_MM.height }
}

export function getContentSizeMm(
  orientation: PaperOrientation,
  marginMm = DEFAULT_MARGIN_MM,
): { width: number; height: number } {
  const page = getPageSizeMm(orientation)
  return {
    width: Math.max(0, page.width - marginMm * 2),
    height: Math.max(0, page.height - marginMm * 2),
  }
}

/** 单侧表格内容宽度（mm） */
export function getSideTableWidthMm(contentWidthMm: number, gapMm: number): number {
  return Math.max(0, (contentWidthMm - gapMm) / 2)
}

/**
 * 按实测高度贪心装页。
 * heights[i] 对应 rows[i] 的行高（px）。
 * 单行超过可用高度时仍独占一页（无法再拆）。
 */
export function packByHeight(heights: number[], availableHeightPx: number): number[][] {
  if (heights.length === 0) return [[]]
  const limit = Math.max(1, availableHeightPx)
  const pages: number[][] = []
  let current: number[] = []
  let used = 0

  heights.forEach((h, index) => {
    const height = Math.max(0, h)
    const fits = current.length === 0 || used + height <= limit + 0.5
    if (!fits) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(index)
    used += height
  })

  if (current.length) pages.push(current)
  return pages
}

export function sliceByIndexPages<T>(rows: T[], indexPages: number[][]): T[][] {
  if (rows.length === 0) return [[]]
  return indexPages.map((indexes) => indexes.map((i) => rows[i]!))
}

/** 左右页数对齐，短的一侧补空数组 */
export function alignPagePairs<T>(leftPages: T[][], rightPages: T[][]): PagePair<T>[] {
  const count = Math.max(leftPages.length, rightPages.length, 1)
  const pairs: PagePair<T>[] = []
  for (let i = 0; i < count; i += 1) {
    pairs.push({
      left: leftPages[i] ?? [],
      right: rightPages[i] ?? [],
    })
  }
  return pairs
}

/** mm → CSS px（按 96dpi） */
export function mmToPx(mm: number): number {
  return (mm * 96) / 25.4
}
