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
import { FIVE_DAY_TIME_SHARE_PERIOD } from '../../controllers/types'

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
    // 五日视图使用首个有效价格作为全窗口百分比轴基准；单日仍以昨收为基准。
    const baseline =
      dm.currentPeriod === FIVE_DAY_TIME_SHARE_PERIOD
        ? (dm
            .getTimeShareRange()
            ?.days.flatMap((day) => day.data)
            .find((point) => Number.isFinite(point.price) && point.price > 0)?.price ?? null)
        : resolveTimeShareBaseline({
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
