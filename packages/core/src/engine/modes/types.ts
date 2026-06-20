import type { Pane } from '../layout/pane'
import type { ChartDataManager } from '../data/chartDataManager'
import type { VisibleRange } from '../layout/pane'

export interface ChartModeHandler {
  readonly debugName: string

  /** 是否允许水平拖拽平移 */
  readonly allowPan: boolean

  /** 是否允许缩放（滚轮/捏合/API） */
  readonly allowZoom: boolean

  /** 是否允许主图垂直滚动 */
  readonly allowVerticalScroll: boolean

  /** 是否允许右轴价格缩放 */
  readonly allowRightAxisScale: boolean

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
  onActivate(chart: {
    enableMainIndicator: (id: string, params?: Record<string, number | boolean | string>) => boolean
    disableMainIndicator: (id: string) => boolean
    setRendererEnabled: (name: string, enabled: boolean) => void
    dataManager: ChartDataManager
    currentPeriod: string
  }, prev: ChartModeHandler | null): void

  /** 停用时调用 */
  onDeactivate(chart: {
    enableMainIndicator: (id: string, params?: Record<string, number | boolean | string>) => boolean
    disableMainIndicator: (id: string) => boolean
    setRendererEnabled: (name: string, enabled: boolean) => void
    dataManager: ChartDataManager
  }, next: ChartModeHandler | null): void
}