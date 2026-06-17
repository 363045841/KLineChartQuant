import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { formatTimestamp } from '@363045841yyt/klinechart-core'
import type { KLineData, ChartController } from '@363045841yyt/klinechart-core/controllers'
import { calcRangeOverlayPixel } from '../../tools/calcRangeOverlayPixel'
import type { Bounds } from '../../tools/calcRangeOverlayPixel'

interface RangeSelectionState {
  startIndex: number | null
  endIndex: number | null
  isDragging: boolean
}

function fmtDate(item: KLineData | undefined): string {
  if (!item) return '?'
  if (item.date) return item.date
  return new Date(item.timestamp).toISOString().slice(0, 10)
}

function formatRangeFileDate(item: KLineData | undefined): string {
  if (!item) return 'unknown'
  if (item.date) return item.date.replace(/[\\/:*?"<>|\s]+/g, '-')
  return new Date(item.timestamp).toISOString().slice(0, 10)
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

export function useRangeSelection(options: {
  controller: Ref<ChartController | null>
  activeToolId: Ref<string>
  containerRef: Ref<HTMLElement | null>
}) {
  const { controller, activeToolId, containerRef } = options

  const containerScrollLeft = ref(0)
  const customStartDate = ref('')
  const customEndDate = ref('')
  const resizeSide = ref<'left' | 'right' | null>(null)

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

  const rangeSelectionOverlayStyle = computed(() => {
    const bounds = rangeSelectionBounds.value
    if (!bounds) return null

    const ctrl = controller.value
    const viewport = ctrl?.getViewport()
    const container = containerRef.value
    if (!ctrl || !viewport || !container) return null

    const px = calcRangeOverlayPixel(bounds, ctrl, container, viewport)
    return {
      left: `${px.left}px`,
      width: `${px.width}px`,
      height: `${px.height}px`,
    }
  })

  function clearRangeSelection() {
    rangeSelection.value = { startIndex: null, endIndex: null, isDragging: false }
    customStartDate.value = ''
    customEndDate.value = ''
  }

  function getIndexByDate(dateStr: string): number | null {
    const data = controller.value?.getData() ?? []
    if (!data.length || !dateStr.trim()) return null
    const trimmed = dateStr.trim()
    const normalized = normalizeDateInput(trimmed)

    for (let i = 0; i < data.length; i++) {
      const item = data[i]
      if (item.date === trimmed || (normalized !== null && item.date === normalized)) return i
      if (!item.date) {
        if (new Date(item.timestamp).toISOString().slice(0, 10) === trimmed) return i
        if (normalized !== null && new Date(item.timestamp).toISOString().slice(0, 10) === normalized) return i
      }
    }
    return null
  }

  watch(customStartDate, (val) => {
    const idx = getIndexByDate(val)
    if (idx !== null) {
      rangeSelection.value = { ...rangeSelection.value, startIndex: idx, isDragging: false }
    }
  })

  watch(customEndDate, (val) => {
    const idx = getIndexByDate(val)
    if (idx !== null) {
      rangeSelection.value = { ...rangeSelection.value, endIndex: idx, isDragging: false }
    }
  })

  function sanitizeLabel(label: string): string {
    return label.replace(/[\\/:*?"<>|\s]+/g, '-')
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

  function onEdgePointerDown(side: 'left' | 'right', e: PointerEvent) {
    if (!isRangeSelectActive.value) return
    resizeSide.value = side
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  function onEdgePointerMove(e: PointerEvent) {
    if (!resizeSide.value || rangeSelection.value.startIndex === null || rangeSelection.value.endIndex === null) return
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    const data = controller.value?.getData() ?? []
    if (!data.length) return
    const rawIndex = controller.value?.getLogicalIndexAtX(e.clientX - rect.left)
    if (rawIndex === null || rawIndex === undefined) return
    const index = Math.max(0, Math.min(rawIndex, data.length - 1))

    if (resizeSide.value === 'left') {
      const end = rangeSelection.value.endIndex
      rangeSelection.value = { ...rangeSelection.value, startIndex: Math.min(index, end) }
    } else {
      const start = rangeSelection.value.startIndex
      rangeSelection.value = { ...rangeSelection.value, endIndex: Math.max(index, start) }
    }
  }

  function onEdgePointerUp(e: PointerEvent) {
    if (!resizeSide.value) return
    const el = e.currentTarget as HTMLElement
    el.releasePointerCapture?.(e.pointerId)
    resizeSide.value = null
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
    const startLabel = customStartDate.value || formatRangeFileDate(data[bounds.start])
    const endLabel = customEndDate.value || formatRangeFileDate(data[bounds.end])
    a.download = `kline-range-${sanitizeLabel(startLabel)}-${sanitizeLabel(endLabel)}.csv`
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
    customStartDate,
    customEndDate,
    containerScrollLeft,
    isRangeSelectActive,
    rangeSelectionReady,
    rangeSelectionBounds,
    rangeSelectionStartLabel,
    rangeSelectionEndLabel,
    rangeSelectionOverlayStyle,
    clearRangeSelection,
    handleRangePointerDown,
    handleRangePointerMove,
    handleRangePointerUp,
    exportRangeToCsv,
    onEdgePointerDown,
    onEdgePointerMove,
    onEdgePointerUp,
    onScroll,
  }
}
