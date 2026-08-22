// 本文件将未注册专用转义器的指标结果转义为紧凑 Markdown 表格。

import { formatTimestamp } from '../../../foundation/utils/dateFormat'
import type { IndicatorTextFormatContext } from './indicatorTextFormatter'

// 空结果的统一文本，避免向 Agent 输出空表格。
const EMPTY_RESULT_TEXT = '无可用数据'
// Markdown 表格的表头分隔符。
const TABLE_SEPARATOR = '---'
// Agent 文本中统一使用的格式化日期列名。
const DATE_COLUMN = 'date'
// 无字段名结果的默认列名。
const VALUE_COLUMN = 'value'
// 计算结果中可映射到行情时间轴的内部下标字段。
const TIMESTAMP_INDEX_KEYS = ['index', 'startIndex', 'endIndex'] as const
// 表格中不直接暴露的内部时间字段。
const INTERNAL_TIME_KEYS = new Set<string>(['timestamp', ...TIMESTAMP_INDEX_KEYS])

type MarkdownRow = Readonly<Record<string, string>>

/** 将查询时间范围与数量限制应用到按 K 线对齐的序列下标。 */
function selectAlignedIndexes(context: IndicatorTextFormatContext): ReadonlyArray<number> {
  const indexes: number[] = []
  for (let index = 0; index < context.timestamps.length; index++) {
    const timestamp = context.timestamps[index]!
    if (timestamp >= context.from && timestamp <= context.to) indexes.push(index)
  }
  return indexes.length > context.limit ? indexes.slice(indexes.length - context.limit) : indexes
}

/** 将未知值展开为表格字段，嵌套对象使用点号路径，数组只保留长度避免重复输入。 */
function flattenValue(
  value: unknown,
  key: string,
  fields: Record<string, string>,
  ancestors: WeakSet<object> = new WeakSet(),
): void {
  if (value === null || value === undefined) {
    fields[key] = '-'
    return
  }
  if (typeof value === 'number') {
    fields[key] = Number.isFinite(value) ? String(value) : '-'
    return
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    fields[key] = String(value)
    return
  }
  if (Array.isArray(value)) {
    fields[key] = `[${value.length}]`
    return
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) {
      return
    }
    ancestors.add(value)
    const entries = Object.entries(value)
    if (entries.length === 0) {
      fields[key] = '{}'
      ancestors.delete(value)
      return
    }
    for (const [childKey, childValue] of entries) {
      flattenValue(childValue, key ? `${key}.${childKey}` : childKey, fields, ancestors)
    }
    ancestors.delete(value)
    return
  }
  fields[key] = String(value)
}

/** 将单行未知值转换为表格字段，可排除内部时间字段。 */
function createRow(value: unknown, excludedKeys: ReadonlySet<string> = new Set()): MarkdownRow {
  const fields: Record<string, string> = {}
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      if (!excludedKeys.has(key)) flattenValue(childValue, key, fields)
    }
  } else {
    flattenValue(value, VALUE_COLUMN, fields)
  }
  return fields
}

/** 将毫秒时间戳格式化为 Agent 可读的日期时间。 */
function formatDate(timestamp: number): string {
  return formatTimestamp(timestamp, { showTime: true })
}

/** 从未知对象读取有限数字字段。 */
function readFiniteNumber(value: unknown, key: string): number | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

/** 读取未知对象的直接时间戳或内部下标，并映射为日期列。 */
function resolveDateColumns(
  value: unknown,
  timestamps: ReadonlyArray<number>,
): Readonly<Record<string, string>> {
  const dateColumns: Record<string, string> = {}
  const timestamp = readFiniteNumber(value, 'timestamp')
  if (timestamp !== null) dateColumns[DATE_COLUMN] = formatDate(timestamp)
  for (const key of TIMESTAMP_INDEX_KEYS) {
    const index = readFiniteNumber(value, key)
    if (index === null || !Number.isInteger(index) || timestamps[index] === undefined) continue
    const dateKey = key === 'endIndex' ? 'endDate' : DATE_COLUMN
    if (dateColumns[dateKey] === undefined) dateColumns[dateKey] = formatDate(timestamps[index]!)
  }
  return dateColumns
}

/** 判断对象是否是由多个等长数组组成的按 K 线对齐序列。 */
function isAlignedSeriesObject(
  value: unknown,
  length: number,
): value is Readonly<Record<string, unknown[]>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.values(value)
  return (
    entries.length > 0 && entries.every((item) => Array.isArray(item) && item.length === length)
  )
}

/** 生成 Markdown 表格，字段名只写入表头一次。 */
function createMarkdownTable(rows: ReadonlyArray<MarkdownRow>): string {
  if (rows.length === 0) return EMPTY_RESULT_TEXT
  const columnSet = new Set<string>()
  for (const row of rows) {
    for (const column of Object.keys(row)) columnSet.add(column)
  }
  const columns = [...columnSet]
  if (columns.length === 0) return EMPTY_RESULT_TEXT
  const header = `| ${columns.join(' | ')} |`
  const separator = `| ${columns.map(() => TABLE_SEPARATOR).join(' | ')} |`
  const body = rows.map((row) => {
    const cells = columns.map((column) =>
      (row[column] ?? '-').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' '),
    )
    return `| ${cells.join(' | ')} |`
  })
  return [header, separator, ...body].join('\n')
}

/** 构造指标标题，参数只出现一次以降低文本体积。 */
function createTitle(context: IndicatorTextFormatContext): string {
  const params = Object.entries(context.params)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')
  return params ? `${context.definitionId} | ${params}` : context.definitionId
}

/** 将按 K 线对齐的数组序列转换为包含时间列的表格行。 */
function createAlignedRows(
  context: IndicatorTextFormatContext,
  readValue: (index: number) => unknown,
): ReadonlyArray<MarkdownRow> {
  return selectAlignedIndexes(context).map((index) => ({
    [DATE_COLUMN]: formatDate(context.timestamps[index]!),
    ...createRow(readValue(index), INTERNAL_TIME_KEYS),
  }))
}

/** 将未知指标结果转义为紧凑 Markdown 文本。 */
export function formatIndicatorMarkdown(context: IndicatorTextFormatContext): string {
  const { series } = context
  let rows: ReadonlyArray<MarkdownRow>
  if (Array.isArray(series)) {
    rows =
      series.length === context.timestamps.length
        ? createAlignedRows(context, (index) => series[index])
        : series.slice(-context.limit).map((value) => ({
            ...resolveDateColumns(value, context.timestamps),
            ...createRow(value, INTERNAL_TIME_KEYS),
          }))
  } else if (isAlignedSeriesObject(series, context.timestamps.length)) {
    const seriesKeys = Object.keys(series)
    rows = createAlignedRows(context, (index) => {
      const point: Record<string, unknown> = {}
      for (const key of seriesKeys) point[key] = series[key]![index]
      return point
    })
  } else {
    rows = [createRow(series)]
  }
  return `${createTitle(context)}\n\n${createMarkdownTable(rows)}`
}
