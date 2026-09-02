import * as XLSX from 'xlsx'

export interface CellMerge {
  /** 如 A1:C2 */
  range: string
  s: { r: number; c: number }
  e: { r: number; c: number }
  /** 合并区域左上角的值 */
  value: unknown
}

export interface SheetParseResult {
  name: string
  /** 二维表数据（含表头行），合并区已按选项填充 */
  rows: unknown[][]
  /** sheet_to_json 对象数组（首行作表头） */
  json: Record<string, unknown>[]
  merges: CellMerge[]
  /** 原始行列范围，如 A1:F20 */
  ref: string
  rowCount: number
  colCount: number
}

export interface WorkbookParseResult {
  fileName: string
  sheetNames: string[]
  sheets: SheetParseResult[]
}

export interface ParseExcelOptions {
  /** 合并单元格是否把主单元格值填满整个合并区，默认 true */
  fillMergedCells?: boolean
  /** 空单元格用什么占位，默认 '' */
  emptyValue?: string
  /** sheet_to_json 是否保留空行，默认 false */
  blankrows?: boolean
}

function encodeRange(s: { r: number; c: number }, e: { r: number; c: number }) {
  return `${XLSX.utils.encode_cell(s)}:${XLSX.utils.encode_cell(e)}`
}

function fillMerges(
  rows: unknown[][],
  merges: XLSX.Range[] | undefined,
  emptyValue: string,
): { matrix: unknown[][]; mergeInfos: CellMerge[] } {
  const matrix = rows.map((row) => [...row])
  const mergeInfos: CellMerge[] = []

  if (!merges?.length) return { matrix, mergeInfos }

  for (const m of merges) {
    const topLeft = matrix[m.s.r]?.[m.s.c]
    const value = topLeft === undefined || topLeft === null || topLeft === '' ? emptyValue : topLeft

    mergeInfos.push({
      range: encodeRange(m.s, m.e),
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c },
      value,
    })

    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!matrix[r]) matrix[r] = []
      for (let c = m.s.c; c <= m.e.c; c++) {
        // 左上角保留原值；其余格子填入主值，便于表格展示/后续业务使用
        if (r === m.s.r && c === m.s.c) {
          matrix[r][c] = value
        } else {
          matrix[r][c] = value
        }
      }
    }
  }

  return { matrix, mergeInfos }
}

function sheetToMatrix(sheet: XLSX.WorkSheet, emptyValue: string): unknown[][] {
  const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: emptyValue,
    raw: false,
    blankrows: false,
  })
  return raw as unknown[][]
}

function parseSheet(
  name: string,
  sheet: XLSX.WorkSheet,
  options: Required<Pick<ParseExcelOptions, 'fillMergedCells' | 'emptyValue' | 'blankrows'>>,
): SheetParseResult {
  const baseRows = sheetToMatrix(sheet, options.emptyValue)
  const merges = sheet['!merges'] as XLSX.Range[] | undefined

  let rows = baseRows
  let mergeInfos: CellMerge[] = []

  if (options.fillMergedCells) {
    const filled = fillMerges(baseRows, merges, options.emptyValue)
    rows = filled.matrix
    mergeInfos = filled.mergeInfos
  } else if (merges?.length) {
    mergeInfos = merges.map((m) => ({
      range: encodeRange(m.s, m.e),
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c },
      value: baseRows[m.s.r]?.[m.s.c] ?? options.emptyValue,
    }))
  }

  // 规范化列数
  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const normalized = rows.map((row) => {
    const next = [...row]
    while (next.length < colCount) next.push(options.emptyValue)
    return next
  })

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: options.emptyValue,
    raw: false,
    blankrows: options.blankrows,
  })

  return {
    name,
    rows: normalized,
    json,
    merges: mergeInfos,
    ref: (sheet['!ref'] as string) || '',
    rowCount: normalized.length,
    colCount,
  }
}

/** 解析浏览器里的 Excel 文件（.xlsx / .xls / .csv） */
export async function parseExcelFile(
  file: File,
  options: ParseExcelOptions = {},
): Promise<WorkbookParseResult> {
  const opts = {
    fillMergedCells: options.fillMergedCells ?? true,
    emptyValue: options.emptyValue ?? '',
    blankrows: options.blankrows ?? false,
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    // 保留合并信息
    bookSheets: false,
  })

  const sheets = workbook.SheetNames.map((name) =>
    parseSheet(name, workbook.Sheets[name], opts),
  )

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    sheets,
  }
}

/** 根据二维表生成 antd Table columns */
export function buildTableColumns(rows: unknown[][], maxPreviewCols = 30) {
  const colCount = Math.min(
    maxPreviewCols,
    rows.reduce((m, r) => Math.max(m, r.length), 0),
  )
  const header = rows[0] || []

  return Array.from({ length: colCount }, (_, i) => {
    const title = String(header[i] ?? `列${i + 1}`)
    return {
      title,
      dataIndex: `c${i}`,
      key: `c${i}`,
      width: Math.min(180, Math.max(80, title.length * 14)),
      ellipsis: true,
    }
  })
}

export function rowsToTableData(rows: unknown[][], hasHeader = true) {
  const dataRows = hasHeader ? rows.slice(1) : rows
  return dataRows.map((row, idx) => {
    const record: Record<string, unknown> = { key: idx }
    row.forEach((cell, i) => {
      record[`c${i}`] = cell
    })
    return record
  })
}
