/**
 * 视口命令：滚动、缩放提交后的定位、尺寸变化与轴宽提交。
 *
 * 「尺寸变化要等到绘制帧再重排」的标志由本模块持有，不再散落在宿主字段上。
 */

import { batch } from '../../../foundation/reactivity/signal.js'
import { isTimeShareDataView, ChartDataViewId } from '../../../foundation/types/chartView.js'
import { PRICE_SERIES_AXIS_ID } from '../../renderers/rendererIds.js'
import type { ChartAxisColumns } from '../../axisWidth/chartAxisColumns.js'
import type { AxisWidths } from '../../axisWidth/types.js'
import type { ChartDom } from '../types.js'
import type { ChartPaneLayout } from '../../pane/index.js'
import type { ChartRenderer } from '../../frame/index.js'
import type { InteractionController } from '../../controller/interaction.js'
import type { ChartStateKernel } from '../../state/chartStateKernel.js'
import type { ChartTimeNavigation } from '../../viewport/chartTimeNavigation.js'
import type { ObjectAxesApi } from '../../pane/axisTypes.js'

/** 视口命令依赖。 */
export interface ChartViewportCommandsDeps {
  readonly kernel: ChartStateKernel
  readonly timeNavigation: ChartTimeNavigation
  readonly axisColumns: ChartAxisColumns
  readonly layoutManager: ChartPaneLayout
  readonly renderer: ChartRenderer
  readonly interaction: InteractionController
  readonly axes: ObjectAxesApi
  readonly dom: ChartDom
  readonly scheduleDraw: () => void
  readonly publishView: () => void
  readonly finishNavigation: () => void
  readonly checkGapWhenIdle: () => void
}

/** 视口与轴宽的唯一命令入口。 */
export class ChartViewportCommands {
  /** 下一帧需要重排 pane；尺寸事件只置位。 */
  private resizePending = false

  constructor(private readonly deps: ChartViewportCommandsDeps) {}

  /** 按 K 线根数水平平移；正数向右。 */
  scrollByBars(bars: number): void {
    if (!Number.isFinite(bars) || bars === 0) return
    const view = this.deps.kernel.viewport.readonly.viewSnapshot.peek()
    if (!view.capabilities.allowPan) return
    const { min, max } = view.scrollBounds
    const target = Math.max(min, Math.min(view.scroll + bars * view.grid.step, max))
    if (this.panTo(target)) {
      this.deps.interaction.stopInertia()
      this.deps.finishNavigation()
    }
  }

  /** 提交拖动、惯性与原生滚动共用的逻辑坐标。 */
  panTo(scroll: number): boolean {
    if (!this.deps.timeNavigation.panTo(scroll)) return false
    this.deps.scheduleDraw()
    return true
  }

  /** 回到初始缩放并贴住最新端。 */
  scrollToRight(): void {
    this.deps.timeNavigation.scrollToLatest()
    this.deps.scheduleDraw()
    this.deps.finishNavigation()
  }

  /** 一次提交默认时间视图与价格轴状态。 */
  reset(): void {
    batch(() => {
      if (this.deps.kernel.mode.readonly.dataView.peek() === ChartDataViewId.KLine)
        this.deps.timeNavigation.reset()
      this.deps.axes.resetRange(PRICE_SERIES_AXIS_ID)
    })
    this.deps.axisColumns.unlock()
    this.deps.scheduleDraw()
    this.deps.finishNavigation()
  }

  /** 提交本帧轴宽；列几何是唯一来源。 */
  commitAxisWidths(widths: AxisWidths): boolean {
    const changed = this.deps.axisColumns.commit(widths)
    this.deps.publishView()
    return changed
  }

  /** 容器尺寸变化：记录测量结果并置位下一帧重排。 */
  resize(size?: { width: number; height: number; dpr: number }): void {
    batch(() => {
      if (size) this.deps.kernel.viewport.actions.resize(size.width, size.height, size.dpr)
      this.updateLayout()
    })
  }

  /** 绘制帧内提交尺寸变化，统一重算 pane 内容区。 */
  commitPendingLayout(): void {
    if (!this.resizePending) return
    const viewport = this.deps.kernel.viewport.readonly.viewport.peek()
    if (viewport.viewWidth === 0) return
    this.resizePending = false
    this.deps.layoutManager.layoutPanes()
  }

  private updateLayout(): void {
    const { kernel, dom, renderer, interaction } = this.deps
    const viewport = kernel.viewport.readonly.viewport.peek()
    const timeShare = isTimeShareDataView(kernel.mode.readonly.dataView.peek())
    if (timeShare ? viewport.plotWidth <= 0 : viewport.viewWidth < 10 || viewport.viewHeight < 10)
      return
    const layer = dom.canvasLayer
    if (layer) {
      const width = `${Math.round(viewport.viewWidth * viewport.dpr) / viewport.dpr}px`
      const height = `${viewport.viewHeight}px`
      if (layer.style.width !== width) layer.style.width = width
      if (layer.style.height !== height) layer.style.height = height
    }
    this.deps.axisColumns.unlock()
    this.resizePending = true
    renderer.clearCachedFrame()
    renderer.invalidateFrame()
    interaction.invalidateHover()
    this.deps.scheduleDraw()
    if (!timeShare) this.deps.checkGapWhenIdle()
  }
}
