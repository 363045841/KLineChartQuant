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
  private _dayCount = 1

  get marketSession(): MarketSessionConfig {
    return this._marketSession
  }

  setMarketSession(config: MarketSessionConfig): void {
    this._marketSession = config
  }

  /** 设置多日分时的已加载交易日数量。 */
  setDayCount(dayCount: number): void {
    this._dayCount = Math.max(1, Math.floor(dayCount))
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
    return computeTimeShareBarMetrics(
      dataLength,
      viewWidth,
      dpr,
      this._marketSession,
      this._dayCount,
    )
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
    const timeShareDays = dm.getTimeShareDays?.() ?? []
    // 多日分时以首日第一笔有效价格统一价格/百分比轴；单日保持昨收基准。
    const baseline =
      timeShareDays.length > 1
        ? resolveTimeShareBaseline({ preClose: timeShareDays[0]?.data[0]?.price })
        : resolveTimeShareBaseline({ preClose: dm.getTimeSharePreClose() })
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
    _chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      dataManager: ChartDataManager
      currentPeriod: string
    },
    _prev: ChartModeHandler | null,
  ): void {
    // 分时主序列与成交量 Pane 由 ChartStateKernel.setDataView 原子写入。
  }

  onDeactivate(
    _chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      dataManager: ChartDataManager
    },
    _next: ChartModeHandler | null,
  ): void {
    // 分时系统实例由 ChartStateKernel.setDataView 在退出时移除。
  }
}
