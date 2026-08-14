import type { ChartDataManager } from '../data/chartDataManager'
import type { Pane, VisibleRange } from '../layout/pane'

import type { MarketSessionConfig } from '../../foundation/utils/timeShareAxisLabels'
import { ASHARE_MARKET_SESSION } from '../../foundation/utils/timeShareAxisLabels'

import {
  computeTimeShareBarMetrics,
  computeTimeSharePriceRange,
  resolveTimeShareBaseline,
} from './timeShareMath'
import type { ChartModeHandler } from './types'

export class TimeShareMode implements ChartModeHandler {
  readonly debugName = 'TimeShare'

  readonly useIndicatorScheduler = false

  /** 市场 session；默认 A 股，可 setMarketSession 切换 */
  private _marketSession: MarketSessionConfig = ASHARE_MARKET_SESSION

  get marketSession(): MarketSessionConfig {
    return this._marketSession
  }

  setMarketSession(config: MarketSessionConfig): void {
    this._marketSession = config
  }

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
    return computeTimeShareBarMetrics(dataLength, viewWidth, dpr, this._marketSession)
  }

  updatePaneRange(
    pane: Pane,
    range: VisibleRange,
    dm: ChartDataManager,
    _mergedIndicatorRange?: { min: number; max: number } | null,
  ): void {
    const tsData = dm.getTimeShareData()
    if (tsData.length === 0) return

    const end = Math.min(range.end, tsData.length)
    const start = Math.max(0, range.start)
    // 优先昨收；缺失时回退首笔价
    const baseline = resolveTimeShareBaseline({
      preClose: dm.getTimeSharePreClose(),
      firstPrice: tsData[0]?.price,
    })
    if (baseline === null) return

    // scaleType 由 kernel.paneScaleTypes 投影（进入 timeshare 时写 percent）；此处只设会话 basePrice
    pane.yAxis.setBasePrice(baseline)

    const visibleValues: number[] = []
    for (let i = start; i < end; i++) {
      const item = tsData[i]
      if (!item) continue
      visibleValues.push(item.price, item.average)
    }
    const priceRange = computeTimeSharePriceRange(visibleValues, baseline)
    if (!priceRange) return
    pane.yAxis.setRange(priceRange)
  }

  onActivate(
    chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      setRendererEnabled: (name: string, enabled: boolean) => void
      dataManager: ChartDataManager
      currentPeriod: string
    },
    _prev: ChartModeHandler | null,
  ): void {
    chart.enableMainIndicator('timeShare')
    chart.setRendererEnabled('candle', false)
  }

  onDeactivate(
    chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      setRendererEnabled: (name: string, enabled: boolean) => void
      dataManager: ChartDataManager
    },
    _next: ChartModeHandler | null,
  ): void {
    chart.disableMainIndicator('timeShare')
    chart.setRendererEnabled('candle', true)
  }
}
