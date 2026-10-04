/** 数据变更只补偿前插索引，空白槽位不触发自动回拉。 */
import type { ViewportStateModule } from '../state/viewportState.js'
import { getPhysicalKLineConfig } from '../viewport/klineConfig.js'

export interface ScrollDeps {
  getOption: () => { kWidth: number; kGap: number }
  /** scroll / dpr / 几何 SSOT */
  viewport: ViewportStateModule
}

export class ScrollCompensator {
  constructor(private deps: ScrollDeps) {}

  compensatePrepend(count: number): void {
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { unitPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const compensation = (count * unitPx) / dpr
    const nextScrollLeft = this.deps.viewport.readonly.scrollLeft.peek() + compensation
    this.deps.viewport.actions.scrollTo(nextScrollLeft)
  }

  scrollToRight(dataLength: number): void {
    if (dataLength === 0) return
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr
    const clientWidth = this.deps.viewport.readonly.viewWidth.peek()
    if (clientWidth <= 0) return

    const leftBuffer = this.deps.viewport.readonly.leftLoadBufferWidth.peek()
    let target: number
    if (lastKLineEndPx <= clientWidth) {
      target = leftBuffer - (clientWidth - lastKLineEndPx)
    } else {
      target = leftBuffer + (lastKLineEndPx - clientWidth)
    }
    const contentWidth = this.deps.viewport.readonly.contentWidth.peek()
    const maxScroll = Math.max(0, contentWidth - clientWidth)
    const scrollLeft = Math.round(Math.max(0, Math.min(target, maxScroll)) * dpr) / dpr
    this.deps.viewport.actions.scrollTo(scrollLeft)
  }
}
