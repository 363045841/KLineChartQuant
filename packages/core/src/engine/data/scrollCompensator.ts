/** 数据变更只补偿前插索引，空白槽位不触发自动回拉。 */
import type { ViewportStateModule } from '../state/viewportState.js'
import { resolvePhysicalKLineConfig } from '../viewport/klineConfig.js'

export interface ScrollDeps {
  getOption: () => { kWidth: number; kGap: number }
  /** scroll / dpr / 几何 SSOT */
  viewport: ViewportStateModule
}

export class ScrollCompensator {
  constructor(private deps: ScrollDeps) {}

  compensatePrepend(count: number): void {
    const { unitPx, dpr } = resolvePhysicalKLineConfig(this.deps)
    const compensation = (count * unitPx) / dpr
    const nextScrollLeft = this.deps.viewport.readonly.scrollLeft.peek() + compensation
    this.deps.viewport.actions.scrollTo(nextScrollLeft)
  }
}
