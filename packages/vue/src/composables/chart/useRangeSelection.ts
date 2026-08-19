/** 区间选择状态、统计指标与 CSV 导出逻辑。 */
import { formatTimestamp } from '@363045841yyt/klinechart-core'
import type {
  KLineData,
  ChartController,
  ChartViewport,
} from '@363045841yyt/klinechart-core/controllers'
import { sourceRouter } from '@363045841yyt/klinechart-core/market-data'
import type { KLineAdjustment, KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

import { calcRangeOverlayPixel } from '../../tools/calcRangeOverlayPixel'
import type { Bounds } from '../../tools/calcRangeOverlayPixel'
import {
  getKLineIndexByTimestamp,
  findNearestKLineIndex,
} from '../../tools/getKLineIndexByTimestamp'

interface RangeSelectionState {
  startTimestamp: number | null
  endTimestamp: number | null
  isDragging: boolean
}

/** 根据区间首尾收盘价计算收益率，无法形成有效比率时返回 null。 */
export function calculateRangeReturnRate(startClose: number, endClose: number): number | null {
  if (!Number.isFinite(startClose) || !Number.isFinite(endClose) || startClose === 0) return null
  return ((endClose - startClose) / startClose) * 100
}

function fmtDate(item: KLineData | undefined): string {
  if (!item) return '?'
  if (item.date) return item.date
  return new Date(item.timestamp).toISOString().slice(0, 10)
}

function toYYYYMMDD(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function normalizeDateInput(input: string): string | null {
  const parts = input.trim().split(/[-/]/)
  if (parts.length !== 3) return null
  const y = parts[0]!.padStart(4, '0')
  const m = parts[1]!.padStart(2, '0')
  const d = parts[2]!.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parseDateToTimestamp(input: string): number | null {
  const normalized = normalizeDateInput(input)
  if (!normalized) return null
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d.getTime()
}

export function useRangeSelection(options: {
  controller: Ref<ChartController | null>
  isRangeSelectMode: Ref<boolean>
  containerRef: Ref<HTMLElement | null>
  data: Readonly<Ref<ReadonlyArray<KLineData>>>
  viewport: Readonly<Ref<ChartViewport>>
  batchSymbols: Ref<string[]>
}) {
  const { controller, isRangeSelectMode, containerRef, data, viewport, batchSymbols } = options

  const customStartDate = ref('')
  const customEndDate = ref('')
  const resizeSide = ref<'left' | 'right' | null>(null)
  const exportingProgress = ref<{ current: number; total: number; label: string } | null>(null)

  const rangeSelection = ref<RangeSelectionState>({
    startTimestamp: null,
    endTimestamp: null,
    isDragging: false,
  })

  const isRangeSelectActive = computed(() => isRangeSelectMode.value)

  const rangeSelectionReady = computed(
    () =>
      rangeSelection.value.startTimestamp !== null && rangeSelection.value.endTimestamp !== null,
  )

  const rangeSelectionBounds: ComputedRef<Bounds | null> = computed(() => {
    const items = data.value
    const { startTimestamp, endTimestamp } = rangeSelection.value
    if (startTimestamp === null || endTimestamp === null || items.length === 0) return null

    const rawStart = findNearestKLineIndex(items, startTimestamp, 'left')
    const rawEnd = findNearestKLineIndex(items, endTimestamp, 'right')
    if (rawStart === null || rawEnd === null) return null

    return { start: Math.min(rawStart, rawEnd), end: Math.max(rawStart, rawEnd) }
  })

  const rangeSelectionStartLabel: ComputedRef<string> = computed(() => {
    const bounds = rangeSelectionBounds.value
    const data = controller.value?.getData() ?? []
    if (!bounds || data.length === 0) return ''
    return fmtDate(data[bounds.start])
  })

  const rangeSelectionEndLabel: ComputedRef<string> = computed(() => {
    const bounds = rangeSelectionBounds.value
    const data = controller.value?.getData() ?? []
    if (!bounds || data.length === 0) return ''
    return fmtDate(data[bounds.end])
  })

  const rangeSelectionCount = computed(() => {
    const bounds = rangeSelectionBounds.value
    if (!bounds) return 0
    return bounds.end - bounds.start + 1
  })

  /** 按时间正序计算区间首尾收盘价收益率，结果单位为百分比。 */
  const rangeSelectionReturnRate: ComputedRef<number | null> = computed(() => {
    const bounds = rangeSelectionBounds.value
    if (!bounds) return null

    const startClose = data.value[bounds.start]?.close
    const endClose = data.value[bounds.end]?.close
    if (startClose === undefined || endClose === undefined) return null
    return calculateRangeReturnRate(startClose, endClose)
  })

  const rangeSelectionOverlayStyle = computed(() => {
    const bounds = rangeSelectionBounds.value
    if (!bounds) return null

    void viewport.value

    const ctrl = controller.value
    const vp = ctrl?.getViewport()
    if (!ctrl || !vp) return null

    const px = calcRangeOverlayPixel(bounds, ctrl, vp)
    return {
      left: `${px.left}px`,
      width: `${px.width}px`,
      height: `${px.height}px`,
    }
  })

  function clearRangeSelection() {
    rangeSelection.value = { startTimestamp: null, endTimestamp: null, isDragging: false }
    customStartDate.value = ''
    customEndDate.value = ''
  }

  watch(customStartDate, (val) => {
    const data = controller.value?.getData() ?? []
    const targetTs = parseDateToTimestamp(val)
    if (targetTs === null || data.length === 0) return
    rangeSelection.value = { ...rangeSelection.value, startTimestamp: targetTs, isDragging: false }
    if (targetTs < data[0]!.timestamp) {
      controller.value?.ensureDataRange(targetTs)
    }
  })

  watch(customEndDate, (val) => {
    const data = controller.value?.getData() ?? []
    const targetTs = parseDateToTimestamp(val)
    if (targetTs === null || data.length === 0) return
    rangeSelection.value = { ...rangeSelection.value, endTimestamp: targetTs, isDragging: false }
    if (targetTs < data[0]!.timestamp) {
      controller.value?.ensureDataRange(targetTs)
    }
  })

  function getRangeSelectionIndex(e: PointerEvent, container: HTMLElement): number | null {
    const data = controller.value?.getData() ?? []
    if (data.length === 0) return null

    const rect = container.getBoundingClientRect()
    const rawIndex = controller.value?.getLogicalIndexAtX(e.clientX - rect.left)
    if (rawIndex === null || rawIndex === undefined) return null
    return Math.max(0, Math.min(rawIndex, data.length - 1))
  }

  function handleRangePointerDown(e: PointerEvent, container: HTMLElement): boolean {
    if (!isRangeSelectActive.value) return false
    if (
      rangeSelection.value.startTimestamp !== null &&
      rangeSelection.value.endTimestamp !== null &&
      !rangeSelection.value.isDragging
    ) {
      return false
    }
    const index = getRangeSelectionIndex(e, container)
    if (index === null) return true

    const data = controller.value?.getData() ?? []
    const ts = data[index]?.timestamp
    if (ts === undefined) return true

    rangeSelection.value = { startTimestamp: ts, endTimestamp: ts, isDragging: true }
    customStartDate.value = ''
    customEndDate.value = ''
    container.setPointerCapture?.(e.pointerId)
    e.preventDefault()
    return true
  }

  function handleRangePointerMove(e: PointerEvent, container: HTMLElement): boolean {
    if (!isRangeSelectActive.value || !rangeSelection.value.isDragging) return false
    const index = getRangeSelectionIndex(e, container)
    if (index !== null) {
      const data = controller.value?.getData() ?? []
      const ts = data[index]?.timestamp
      if (ts !== undefined) {
        rangeSelection.value = { ...rangeSelection.value, endTimestamp: ts }
      }
    }
    e.preventDefault()
    return true
  }

  function handleRangePointerUp(e: PointerEvent, container: HTMLElement): boolean {
    if (!isRangeSelectActive.value || !rangeSelection.value.isDragging) return false
    const index = getRangeSelectionIndex(e, container)
    if (index !== null) {
      const data = controller.value?.getData() ?? []
      const ts = data[index]?.timestamp
      if (ts !== undefined) {
        rangeSelection.value = {
          ...rangeSelection.value,
          endTimestamp: ts,
          isDragging: false,
        }
      } else {
        rangeSelection.value = { ...rangeSelection.value, isDragging: false }
      }
    } else {
      rangeSelection.value = { ...rangeSelection.value, isDragging: false }
    }
    container.releasePointerCapture?.(e.pointerId)
    e.preventDefault()
    return true
  }

  function onEdgePointerDown(side: 'left' | 'right', e: PointerEvent) {
    if (!isRangeSelectActive.value) return
    resizeSide.value = side
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  function onEdgePointerMove(e: PointerEvent) {
    if (
      !resizeSide.value ||
      rangeSelection.value.startTimestamp === null ||
      rangeSelection.value.endTimestamp === null
    )
      return
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    const data = controller.value?.getData() ?? []
    if (!data.length) return
    const rawIndex = controller.value?.getLogicalIndexAtX(e.clientX - rect.left)
    if (rawIndex === null || rawIndex === undefined) return
    const index = Math.max(0, Math.min(rawIndex, data.length - 1))
    const ts = data[index]?.timestamp
    if (ts === undefined) return

    if (resizeSide.value === 'left') {
      if (ts > rangeSelection.value.endTimestamp) {
        rangeSelection.value = {
          startTimestamp: rangeSelection.value.endTimestamp,
          endTimestamp: ts,
          isDragging: false,
        }
        resizeSide.value = 'right'
      } else {
        rangeSelection.value = { ...rangeSelection.value, startTimestamp: ts }
      }
    } else {
      if (ts < rangeSelection.value.startTimestamp) {
        rangeSelection.value = {
          startTimestamp: ts,
          endTimestamp: rangeSelection.value.startTimestamp,
          isDragging: false,
        }
        resizeSide.value = 'left'
      } else {
        rangeSelection.value = { ...rangeSelection.value, endTimestamp: ts }
      }
    }
  }

  function onEdgePointerUp(e: PointerEvent) {
    if (!resizeSide.value) return
    const el = e.currentTarget as HTMLElement
    el.releasePointerCapture?.(e.pointerId)
    resizeSide.value = null
  }

  const CSV_FIELDS: Array<keyof KLineData> = [
    'timestamp',
    'open',
    'high',
    'low',
    'close',
    'volume',
    'turnover',
    'turnoverRate',
    'amplitude',
    'changePercent',
    'changeAmount',
  ]

  function downloadCsv(
    items: ReadonlyArray<KLineData>,
    prefix: string,
    startTs: number,
    endTs: number,
  ) {
    const header = `symbol,time,${CSV_FIELDS.join(',')}`
    const rows = [
      header,
      ...items.map((item) => {
        const timeStr = toCsvCell(formatTimestamp(item.timestamp, { showTime: true }))
        const code = toCsvCell(item.symbol ?? prefix)
        return `${code},${timeStr},${CSV_FIELDS.map((field) => toCsvCell(item[field])).join(',')}`
      }),
    ]
    const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prefix}-${toYYYYMMDD(startTs)}-${toYYYYMMDD(endTs)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function exportRangeToCsv() {
    const bounds = rangeSelectionBounds.value
    const data = controller.value?.getData() ?? []
    if (!bounds || data.length === 0) return

    const startTs = data[bounds.start]!.timestamp
    const endTs = data[bounds.end]!.timestamp
    const mainSymbol = controller.value?.symbols.peek()?.[0]?.symbol ?? 'unknown'
    const batchCodes = batchSymbols.value.filter((c) => c !== mainSymbol)
    const total = 1 + batchCodes.length
    const prefix =
      batchSymbols.value.length > 0 ? `batch${batchSymbols.value.length + 1}` : mainSymbol

    const allItems: KLineData[] = []

    exportingProgress.value = { current: 0, total, label: '正在准备主品种数据...' }

    // Main stock
    for (const item of data.slice(bounds.start, bounds.end + 1)) {
      allItems.push(item)
    }
    exportingProgress.value = { current: 1, total, label: '主品种数据已就绪' }

    if (batchCodes.length > 0) {
      const spec = controller.value?.symbols.peek()?.[0]
      const period = (spec?.period ?? 'daily') as KLinePeriod
      const adjustment = (spec?.adjust ?? 'none') as KLineAdjustment

      for (let i = 0; i < batchCodes.length; i++) {
        const code = batchCodes[i]!
        exportingProgress.value = { current: 1 + i, total, label: `正在获取 ${code}...` }
        try {
          const result = await sourceRouter.bars({
            preferredSourceId: spec?.source,
            instrument: spec?.instrument,
            symbol: code,
            exchange: spec?.exchange,
            assetClass: spec?.instrument?.assetClass,
            period,
            adjustment,
            limit: 500,
            before: endTs + 86_400_000,
          })
          for (const item of result.series.data) {
            if (item.timestamp >= startTs && item.timestamp <= endTs) allItems.push(item)
          }
        } catch {
          continue
        }
      }
    }

    exportingProgress.value = { current: total, total, label: '正在生成文件...' }
    downloadCsv(allItems, prefix, startTs, endTs)
    exportingProgress.value = { current: total, total, label: '导出完成' }
  }

  return {
    rangeSelection,
    customStartDate,
    customEndDate,
    isRangeSelectActive,
    rangeSelectionReady,
    rangeSelectionBounds,
    rangeSelectionCount,
    rangeSelectionReturnRate,
    rangeSelectionStartLabel,
    rangeSelectionEndLabel,
    rangeSelectionOverlayStyle,
    clearRangeSelection,
    handleRangePointerDown,
    handleRangePointerMove,
    handleRangePointerUp,
    exportRangeToCsv,
    exportingProgress,
    onEdgePointerDown,
    onEdgePointerMove,
    onEdgePointerUp,
  }
}
