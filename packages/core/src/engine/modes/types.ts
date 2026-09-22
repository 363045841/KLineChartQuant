/** 图表模式契约：K 线/分时等模式对内容宽度、柱宽与价格范围的统一接口。 */
import type { ChartDataManager } from '../data/chartDataManager.js'
import type { Pane, VisibleRange } from '../layout/pane.js'

export interface ChartModeHandler {
  readonly debugName: string

  /** 是否使用指标调度器（计算 MA/BOLL 等技术指标） */
  readonly useIndicatorScheduler: boolean

  /** 计算内容宽度（CSS px）。返回 null 走标准可滚动计算 */
  computeContentWidth(
    dataLength: number,
    leftBufferWidth: number,
    viewWidth: number,
    opt: { kWidth: number; kGap: number },
    dpr: number,
  ): number | null

  /** 计算 K 线宽度/间距。返回 null 走标准缩放计算 */
  computeKWidth(
    dataLength: number,
    viewWidth: number,
    dpr: number,
  ): { kWidth: number; kGap: number } | null

  /** 更新 Pane 的价格范围 */
  updatePaneRange(
    pane: Pane,
    range: VisibleRange,
    dm: ChartDataManager,
    mergedIndicatorRange?: { min: number; max: number } | null,
  ): void

  /** 激活时调用 */
  onActivate(
    chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      dataManager: ChartDataManager
      currentPeriod: string
    },
    prev: ChartModeHandler | null,
  ): void

  /** 停用时调用 */
  onDeactivate(
    chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      dataManager: ChartDataManager
    },
    next: ChartModeHandler | null,
  ): void
}
