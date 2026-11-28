/**
 * 时间导航命令：把时间窗口或最新端写成导航目标。
 *
 * 目标是声明式的：宽度变化时由投影重新解算，不存在待恢复状态，也不回写派生几何。
 */

import type { SymbolSpec } from '../../data/symbolSpec.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import { visibleTimeRange } from './timeNavigation.js'
import type { SeriesViewportMemory } from './viewMemory/index.js'

/** 时间导航命令所需的依赖。 */
export interface TimeNavigationDeps {
  readonly viewport: ViewportStateModule
  readonly bars: () => readonly KLineData[]
  readonly initialZoomLevel: number
  readonly memory: SeriesViewportMemory
}

/** 时间窗口与视口记忆的唯一命令入口。 */
export class ChartTimeNavigation {
  constructor(private readonly deps: TimeNavigationDeps) {}

  /** 提交一个时间窗口；状态即刻成立，不依赖当前是否可测量。 */
  frame(fromTime: number, toTime: number): boolean {
    return this.deps.viewport.actions.commitTimeWindow(fromTime, toTime)
  }

  /** 回到初始缩放并贴住最新端。 */
  reset(): void {
    this.deps.viewport.actions.commitLatest(this.deps.initialZoomLevel)
  }

  /** 保持当前缩放，贴住最新端。 */
  scrollToLatest(): void {
    const { viewport } = this.deps
    viewport.actions.commitLatest(viewport.readonly.viewportState.peek().zoomLevel)
  }

  /** 拖动与惯性的唯一写入入口；越界由视口收敛。 */
  panTo(scroll: number): boolean {
    return this.deps.viewport.actions.commitScroll(scroll)
  }

  /** 历史前插后保持屏幕内容不动。 */
  preserveOnPrepend(previousScroll: number, count: number): void {
    const step = this.deps.viewport.readonly.viewSnapshot.peek().grid.step
    this.deps.viewport.actions.commitScroll(previousScroll + count * step)
  }

  /** 记录当前可见时间区间；离开序列或保存布局前调用。 */
  save(spec: SymbolSpec): void {
    const snapshot = visibleTimeRange(
      this.deps.viewport.readonly.viewSnapshot.peek(),
      this.deps.bars(),
    )
    if (snapshot) this.deps.memory.save(spec, snapshot)
  }
}
