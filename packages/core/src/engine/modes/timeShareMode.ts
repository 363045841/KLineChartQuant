import type { ChartModeHandler } from './types'
import type { Pane, VisibleRange } from '../layout/pane'
import type { ChartDataManager } from '../data/chartDataManager'

export class TimeShareMode implements ChartModeHandler {
  readonly debugName = 'TimeShare'

  readonly allowPan = false
  readonly allowZoom = false
  readonly allowVerticalScroll = false
  readonly allowRightAxisScale = false
  readonly useIndicatorScheduler = false

  computeContentWidth(
    _dataLength: number,
    leftBufferWidth: number,
    viewWidth: number,
    _opt: { kWidth: number; kGap: number },
    _dpr: number,
  ): number | null {
    return leftBufferWidth + Math.max(viewWidth, 1)
  }

  computeKWidth(
    dataLength: number,
    viewWidth: number,
    dpr: number,
  ): { kWidth: number; kGap: number } | null {
    if (dataLength <= 0 || viewWidth <= 0) return null

    const kGapPx = 1
    const totalGapPx = (dataLength + 1) * kGapPx
    const availablePx = Math.max(1, viewWidth * dpr - totalGapPx)
    let kWidthPx = Math.max(1, Math.floor(availablePx / dataLength))

    return {
      kWidth: kWidthPx / dpr,
      kGap: kGapPx / dpr,
    }
  }

  updatePaneRange(
    pane: Pane,
    range: VisibleRange,
    dm: ChartDataManager,
    _mergedIndicatorRange?: { min: number; max: number } | null,
  ): void {
    const tsData = dm.getTimeShareData()
    const end = Math.min(range.end, tsData.length)
    if (tsData.length === 0) return

    const baseline = tsData[0]?.price ?? 0
    if (baseline === 0) return

    pane.yAxis.setScaleType('percent')
    pane.yAxis.setBasePrice(baseline)

    let maxAbsPct = 0
    for (let i = Math.max(0, range.start); i < end; i++) {
      const p = tsData[i]?.price
      if (p !== undefined && Number.isFinite(p)) {
        const pct = Math.abs((p - baseline) / baseline) * 100
        if (pct > maxAbsPct) maxAbsPct = pct
      }
    }
    if (maxAbsPct <= 0) return

    const padding = Math.max(maxAbsPct * 0.1, 0.5)
    const displayPct = maxAbsPct + padding
    const minPrice = baseline * (1 - displayPct / 100)
    const maxPrice = baseline * (1 + displayPct / 100)
    pane.yAxis.setRange({ maxPrice, minPrice })
  }

  onActivate(chart: {
    enableMainIndicator: (id: string, params?: Record<string, number | boolean | string>) => boolean
    disableMainIndicator: (id: string) => boolean
    setRendererEnabled: (name: string, enabled: boolean) => void
    dataManager: ChartDataManager
    currentPeriod: string
  }, _prev: ChartModeHandler | null): void {
    chart.enableMainIndicator('timeShare')
    chart.setRendererEnabled('candle', false)
  }

  onDeactivate(chart: {
    enableMainIndicator: (id: string, params?: Record<string, number | boolean | string>) => boolean
    disableMainIndicator: (id: string) => boolean
    setRendererEnabled: (name: string, enabled: boolean) => void
    dataManager: ChartDataManager
  }, _next: ChartModeHandler | null): void {
    chart.disableMainIndicator('timeShare')
    chart.setRendererEnabled('candle', true)
  }
}