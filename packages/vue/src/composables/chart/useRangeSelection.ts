import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { formatTimestamp } from '@363045841yyt/klinechart-core'
import type { KLineData, ChartController } from '@363045841yyt/klinechart-core/controllers'

interface RangeSelectionState {
  startIndex: number | null
  endIndex: number | null
  isDragging: boolean
}

interface Bounds {
  start: number
  end: number
}

function formatRangeFileDate(item: KLineData | undefined): string {
  if (!item) return 'unknown'
  if (item.date) return item.date.replace(/[\\/:*?"<>|\s]+/g, '-')
  return new Date(item.timestamp).toISOString().slice(0, 10)
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function useRangeSelection(options: {
  controller: Ref<ChartController | null>
  activeToolId: Ref<string>
  containerRef: Ref<HTMLElement | null>
}) {
  const { controller, activeToolId, containerRef } = options

  const containerScrollLeft = ref(0)
  const rangeSelection = ref<RangeSelectionState>({
    startIndex: null,
    endIndex: null,
    isDragging: false,
  })

  const isRangeSelectActive = computed(() => activeToolId.value === 'range-select')

  const rangeSelectionReady = computed(
    () =>
      rangeSelection.value.startIndex !== null && rangeSelection.value.endIndex !== null,
  )

  const rangeSelectionBounds: ComputedRef<Bounds | null> = computed(() => {
    const data = controller.value?.getData() ?? []
    const { startIndex, endIndex } = rangeSelection.value
    if (startIndex === null || endIndex === null || data.length === 0) return null

    const last = data.length - 1
    const start = Math.max(0, Math.min(startIndex, endIndex, last))
    const end = Math.max(0, Math.min(Math.max(startIndex, endIndex), last))
    return { start, end }
  })

  const rangeSelectionDateLabel: ComputedRef<string> = computed(() => {
    const bounds = rangeSelectionBounds.value
    const data = controller.value?.getData() ?? []
    if (!bounds || data.length === 0) return ''

    const first = data[bounds.start]
    const last = data[bounds.end]
    const fmt = (item: KLineData | undefined) => {
      if (!item) return '?'
      if (item.date) return item.date
      return new Date(item.timestamp).toISOString().slice(0, 10)
    }
    if (bounds.start === bounds.end) return fmt(first)
    return `${fmt(first)} ~ ${fmt(last)}`
  })

  const rangeSelectionOverlayStyle = computed(() => {
    const bounds = rangeSelectionBounds.value
    if (!bounds) return null

    const ctrl = controller.value
    const viewport = ctrl?.getViewport()
    const container = containerRef.value
    if (!ctrl || !viewport || !container) return null

    const { kWidth: currentKWidth, kGap: currentKGap } = ctrl.getKWidthKGap()
    const dpr = ctrl.getCurrentDpr()
    const kWidthPx = Math.max(
      1,
      Math.round(currentKWidth * dpr) + (Math.round(currentKWidth * dpr) % 2 === 0 ? 1 : 0),
    )
    const kGapPx = Math.round(currentKGap * dpr)
    const unitPx = kWidthPx + kGapPx
    const startXPx = kGapPx

    const leftBuffer = container.scrollLeft - viewport.scrollLeft
    const left = leftBuffer + (startXPx + bounds.start * unitPx) / dpr
    const right = leftBuffer + (startXPx + bounds.end * unitPx + kWidthPx) / dpr
    return {
      left: `${left}px`,
      width: `${right - left}px`,
      height: `${viewport.plotHeight}px`,
    }
  })

  function clearRangeSelection() {
    rangeSelection.value = { startIndex: null, endIndex: null, isDragging: false }
  }

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
    const index = getRangeSelectionIndex(e, container)
    if (index === null) return true

    rangeSelection.value = { startIndex: index, endIndex: index, isDragging: true }
    container.setPointerCapture?.(e.pointerId)
    e.preventDefault()
    return true
  }

  function handleRangePointerMove(e: PointerEvent, container: HTMLElement): boolean {
    if (!isRangeSelectActive.value || !rangeSelection.value.isDragging) return false
    const index = getRangeSelectionIndex(e, container)
    if (index !== null) {
      rangeSelection.value = { ...rangeSelection.value, endIndex: index }
    }
    e.preventDefault()
    return true
  }

  function handleRangePointerUp(e: PointerEvent, container: HTMLElement): boolean {
    if (!isRangeSelectActive.value || !rangeSelection.value.isDragging) return false
    const index = getRangeSelectionIndex(e, container)
    rangeSelection.value = {
      ...rangeSelection.value,
      endIndex: index ?? rangeSelection.value.endIndex,
      isDragging: false,
    }
    container.releasePointerCapture?.(e.pointerId)
    e.preventDefault()
    return true
  }

  function exportRangeToCsv() {
    const bounds = rangeSelectionBounds.value
    const data = controller.value?.getData() ?? []
    if (!bounds || data.length === 0) return

    const fields: Array<keyof KLineData> = [
      'timestamp',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'turnover',
      'turnoverRate',
      'stockCode',
      'amplitude',
      'changePercent',
      'changeAmount',
    ]
    const selected = data.slice(bounds.start, bounds.end + 1)
    const header = `time,${fields.join(',')}`
    const rows = [
      header,
      ...selected.map((item) => {
        const timeStr = toCsvCell(formatTimestamp(item.timestamp, { showTime: true }))
        return `${timeStr},${fields.map((field) => toCsvCell(item[field])).join(',')}`
      }),
    ]
    const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kline-range-${formatRangeFileDate(data[bounds.start])}-${formatRangeFileDate(data[bounds.end])}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function onScroll() {
    const cont = containerRef.value
    if (cont) containerScrollLeft.value = cont.scrollLeft
  }

  return {
    rangeSelection,
    containerScrollLeft,
    isRangeSelectActive,
    rangeSelectionReady,
    rangeSelectionBounds,
    rangeSelectionDateLabel,
    rangeSelectionOverlayStyle,
    clearRangeSelection,
    handleRangePointerDown,
    handleRangePointerMove,
    handleRangePointerUp,
    exportRangeToCsv,
    onScroll,
  }
}
