/** 数据变更只补偿前插索引，空白槽位不触发自动回拉。 */
import type { ViewportStateModule } from '../state/viewportState.js'
import { getPhysicalKLineConfig } from '../viewport/klineConfig.js'

export interface ScrollDeps {
  getOption: () => { kWidth: number; kGap: number }
  /** scroll / dpr / 几何 SSOT */
  viewport: ViewportStateModule
}

/** 定位到最新数据时的对齐选项。 */
export interface ScrollToRightOptions {
  /**
   * 数据不足一屏且确认没有更早历史时，首根 K 线贴左对齐，
   * 避免左侧出现永远不会被填充的空白槽位。缺省保持右对齐。
   */
  alignShortDataLeft?: boolean
}

/** 视口相对已加载历史的槽位度量，供向左预取决策使用。 */
export interface LeftHistoryWindow {
  /** 一屏可容纳的 K 线槽位数；视口未就绪时为 0。 */
  visibleSlots: number
  /** 视口左缘之外、已加载但未显示的 K 线根数。 */
  leftMarginSlots: number
  /** 视口内首根 K 线左侧露出的空白槽位数。 */
  blankSlots: number
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

  /** 以视口几何度量左侧已加载余量与露出的空白槽位。 */
  measureLeftHistory(): LeftHistoryWindow {
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { unitLogical, startXLogical } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const clientWidth = this.deps.viewport.readonly.viewWidth.peek()
    if (clientWidth <= 0 || unitLogical <= 0) {
      return { visibleSlots: 0, leftMarginSlots: 0, blankSlots: 0 }
    }
    // 世界坐标滚动量：负值表示视口左缘越过首根 K 线，露出左侧加载缓冲区。
    const logicalScroll =
      this.deps.viewport.readonly.scrollLeft.peek() -
      this.deps.viewport.readonly.leftLoadBufferWidth.peek()
    return {
      visibleSlots: clientWidth / unitLogical,
      leftMarginSlots: Math.max(0, (logicalScroll - startXLogical) / unitLogical),
      blankSlots: logicalScroll < 0 ? Math.ceil(-logicalScroll / unitLogical) : 0,
    }
  }

  scrollToRight(dataLength: number, options: ScrollToRightOptions = {}): void {
    if (dataLength === 0) return
    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)
    const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr
    const clientWidth = this.deps.viewport.readonly.viewWidth.peek()
    if (clientWidth <= 0) return

    const leftBuffer = this.deps.viewport.readonly.leftLoadBufferWidth.peek()
    let target: number
    if (lastKLineEndPx <= clientWidth && options.alignShortDataLeft) {
      target = leftBuffer
    } else if (lastKLineEndPx <= clientWidth) {
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
