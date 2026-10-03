/** 统一 renderer 程序滚动提交与原生 scroll 事件回流。 */

/**
 * 管理滚动容器在 render frame 与原生事件之间的确认关系。
 *
 * 程序化写入可能异步触发 scroll 事件；该事件不应被误判为用户输入并再次请求绘制。
 */
export class ViewportScrollBridge {
  private pendingProgrammaticScrollLeft: number | null = null

  /**
   * 创建滚动桥接器。
   * @param getContainer - 获取当前滚动容器，容器销毁后可返回 null。
   */
  constructor(private readonly getContainer: () => HTMLElement | null) {}

  /**
   * 在 render frame 内提交目标滚动位置。
   * @param targetScrollLeft - 已由 viewport state 钳制的 CSS 像素位置。
   */
  commit(targetScrollLeft: number, content?: { element: HTMLElement; width: number }): void {
    const container = this.getContainer()
    if (!container) {
      this.pendingProgrammaticScrollLeft = null
      return
    }
    // 宽度变更会触发浏览器自动夹取 scrollLeft，必须与模型目标在同一帧提交并确认。
    if (content && content.element.style.width !== `${content.width}px`) {
      content.element.style.width = `${content.width}px`
    }
    if (container.scrollLeft === targetScrollLeft) {
      this.pendingProgrammaticScrollLeft = container.scrollLeft
      return
    }

    container.scrollLeft = targetScrollLeft
    // 记录浏览器实际接受的值，避免子像素钳制导致回流事件无法匹配。
    this.pendingProgrammaticScrollLeft = container.scrollLeft
  }

  /**
   * 判断原生 scroll 是否由最近一次程序化提交产生。
   * @param actualScrollLeft - 原生事件发生时容器的实际 scrollLeft。
   * @returns true 表示外部用户输入，调用方应同步 state 并请求绘制。
   */
  isExternalScroll(actualScrollLeft: number): boolean {
    if (this.pendingProgrammaticScrollLeft === actualScrollLeft) {
      return false
    }
    this.pendingProgrammaticScrollLeft = null
    return true
  }

  /** 清除销毁前遗留的程序化滚动确认。 */
  dispose(): void {
    this.pendingProgrammaticScrollLeft = null
  }
}
