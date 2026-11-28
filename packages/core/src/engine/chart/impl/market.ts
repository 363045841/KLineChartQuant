/**
 * 序列切换命令：准备历史，提交序列与工作区，接入实时流。
 *
 * 只依赖显式端口，不接触宿主实例；布局应用与视图目标在提交内一次完成。
 */

import type { ChartDataView } from '../../../foundation/types/chartView.js'
import { isTimeShareDataView } from '../../../foundation/types/chartView.js'
import { batch } from '../../../foundation/reactivity/signal.js'
import type { MarketSessionRegistry } from '../../../foundation/config/marketSession/marketSessionRegistry.js'
import type { SymbolSpec } from '../../../data/symbolSpec.js'
import type { ChartDataManager } from '../../data/chartDataManager.js'
import { preparePrimaryHistory } from '../../data/preparePrimaryHistory.js'
import type { LayoutDocument } from '../../layout/index.js'
import type { ChartStateKernel } from '../../state/chartStateKernel.js'
import { resolveChartDataView } from '../../chartModel/index.js'
import { symbolSpecIdentityKey } from '../../data/symbolIdentity.js'
import { DEFAULT_KLINE_PERIOD } from '../../../data/provider/types.js'
import { resolveSymbolMarketSession } from '../../../foundation/config/marketSession/resolveSymbolMarketSession.js'
import { readViewportSnapshot, seriesViewportKey } from '../../viewport/viewMemory/index.js'
import type { ChartTimeNavigation } from '../../viewport/chartTimeNavigation.js'

/** 序列切换所需的端口。 */
export interface ChartMarketPorts {
  readonly kernel: ChartStateKernel
  readonly dataManager: ChartDataManager
  readonly marketSessions: MarketSessionRegistry
  readonly timeNavigation: ChartTimeNavigation
  /** 进入精确坐标前的视图记录。 */
  captureView(spec: SymbolSpec): void
  /** 清空旧模式的画布与图例。 */
  clearModeFrame(): void
  cancelDrawingSession(): void
  clearRangeSelection(): void
  stopMotion(): void
  /** 系统与绘图选择随序列身份失效。 */
  syncDrawingSelection(primary: SymbolSpec | null, previousPeriod: string | undefined): void
  unlockAxisWidth(): void
  scheduleDraw(): void
  /** 最近一次切换失败原因。 */
  setSelectionError(message: string | null): void
}

/** 时间窗口目标；`null` 表示回到最新端。 */
export type SavedViewport = { readonly fromTime: number; readonly toTime: number } | null

/** 序列切换与原子的唯一实现。 */
export class ChartMarketCommands {
  private request: AbortController | null = null

  constructor(private readonly ports: ChartMarketPorts) {}

  /** 整体替换主品种（含周期、复权与来源）。 */
  setPrimaryMarket(spec: SymbolSpec | null, options?: { date?: number }): Promise<void> {
    return this.transition(spec, options?.date)
  }

  /** 应用布局文档：导入视图记忆后按同一路径切换。 */
  applyLayout(document: LayoutDocument): Promise<void> {
    const spec =
      document.currentSymbol === undefined
        ? this.ports.kernel.dataManager.readonly.currentSpec.peek()
        : document.currentSymbol
    return this.transition(spec, undefined, document)
  }

  /** 释放进行中的切换；之后的提交会被取消。 */
  dispose(): void {
    this.request?.abort()
    this.request = null
  }

  private transition(
    primary: SymbolSpec | null,
    date?: number,
    layout?: LayoutDocument,
  ): Promise<void> {
    const dataView = resolveChartDataView(primary?.period)
    // 未知 session 必须在任何状态写入之前抛错。
    if (isTimeShareDataView(dataView) && primary)
      resolveSymbolMarketSession(primary.instrument, this.ports.marketSessions)
    const prepared = this.ports.dataManager.preparePrimarySelection(primary, date)
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    this.ports.setSelectionError(null)
    return this.commit(prepared, dataView, request, layout)
  }

  private async commit(
    prepared: ReturnType<ChartDataManager['preparePrimarySelection']>,
    dataView: ChartDataView,
    request: AbortController,
    layout?: LayoutDocument,
  ): Promise<void> {
    const { spec: primary, bars } = prepared
    const timeShare = isTimeShareDataView(dataView)
    const { kernel, dataManager } = this.ports
    const previous = kernel.dataManager.readonly.currentSpec.peek()
    const saved = primary && !timeShare ? this.readSaved(primary, layout) : null

    let committed = false
    try {
      // 命中保存区间时先把历史补到区间左端，再提交；提交后才有实时流。
      if (bars) await preparePrimaryHistory(bars, saved, request.signal)
      request.signal.throwIfAborted()
      if (kernel.mode.readonly.dataView.peek() !== dataView) this.ports.clearModeFrame()
      batch(() => {
        const sameSeries =
          previous && primary && seriesViewportKey(previous) === seriesViewportKey(primary)
        if (previous && !sameSeries) this.ports.captureView(previous)
        this.ports.cancelDrawingSession()
        this.ports.clearRangeSelection()
        this.ports.syncDrawingSelection(primary, previous?.period)
        this.ports.stopMotion()
        this.ports.unlockAxisWidth()
        if (layout) {
          kernel.viewMemory.importMap(layout.viewport ?? {})
          kernel.applyLayout(layout, dataView)
        }
        dataManager.commitPrimarySelection(prepared)
        committed = true
        if (!layout) kernel.actions.setDataView(dataView)
        if (primary && !timeShare)
          kernel.mode.actions.setLastBarPeriod(primary.period ?? DEFAULT_KLINE_PERIOD)
      })
      if (primary && !timeShare) {
        if (saved) this.ports.timeNavigation.frame(saved.fromTime, saved.toTime)
        else this.ports.timeNavigation.reset()
      }
      this.ports.scheduleDraw()
      if (!request.signal.aborted) bars?.startLive()
    } catch (error) {
      if (!request.signal.aborted)
        this.ports.setSelectionError(error instanceof Error ? error.message : String(error))
      if (layout) throw error
    } finally {
      if (!committed) bars?.dispose()
      if (this.request === request) this.request = null
    }
  }

  /** 读取保存区间：布局文档优先，其次是当前图表记忆。 */
  private readSaved(spec: SymbolSpec, layout?: LayoutDocument): SavedViewport {
    if (layout) return readViewportSnapshot(layout.viewport?.[seriesViewportKey(spec)])
    return this.ports.kernel.viewMemory.get(spec)
  }
}
