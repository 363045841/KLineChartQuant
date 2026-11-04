/** 「回到最新 K 线」浮钮的可见性判定与容器监听。 */
import { type ComputedRef, computed, ref } from 'vue'

/** 判定右侧是否仍有未滚出历史的像素容差，避免亚像素误差反复闪烁。 */
const SCROLL_TOLERANCE_PX = 1

/**
 * 判断滚动容器是否遮住了更早的历史（右侧仍有可滚动余量）。
 * @param scrollLeft 当前横向滚动偏移
 * @param scrollWidth 内容总宽度
 * @param clientWidth 可视宽度
 * @param tolerance 容差像素
 * @returns 右侧仍有余量时为 true
 */
export function hasHiddenHistory(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  tolerance = SCROLL_TOLERANCE_PX,
): boolean {
  const maxScrollLeft = scrollWidth - clientWidth
  return maxScrollLeft > tolerance && maxScrollLeft - scrollLeft > tolerance
}

export interface JumpToLatestOptions {
  /** 触发滚动到最新 K 线，通常直接转调控制器。 */
  readonly scrollToRight: () => void
}

export interface JumpToLatestHandle {
  /** 是否已离开最新 K 线，供浮钮可见性消费。 */
  readonly isAwayFromLatest: ComputedRef<boolean>
  /** 滚回最新 K 线。 */
  readonly jumpToLatest: () => void
  /** 绑定滚动容器：挂载滚动与尺寸监听并立即刷新一次。 */
  readonly attach: (element: HTMLElement) => void
  /** 解绑滚动容器并释放监听。 */
  readonly detach: () => void
  /** 手动刷新可见性，供数据增长、缩放等外部变化调用。 */
  readonly refresh: () => void
}

/**
 * 管理「回到最新 K 线」的状态与容器监听。
 * @param options 滚回动作注入
 * @returns 可见性、滚回动作与监听生命周期句柄
 */
export function useJumpToLatest(options: JumpToLatestOptions): JumpToLatestHandle {
  const awayFromLatest = ref(false)
  let container: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null

  /** 读取当前容器几何，刷新可见性。 */
  function refresh(): void {
    if (container === null) return
    awayFromLatest.value = hasHiddenHistory(
      container.scrollLeft,
      container.scrollWidth,
      container.clientWidth,
    )
  }

  /** 绑定容器；重复调用先释放旧监听，避免句柄泄漏。 */
  function attach(element: HTMLElement): void {
    detach()
    container = element
    element.addEventListener('scroll', refresh, { passive: true })
    // happy-dom 等测试环境可能没有 ResizeObserver，缺失时只依赖滚动事件。
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(refresh)
      resizeObserver.observe(element)
    }
    refresh()
  }

  /** 解绑容器并释放监听。 */
  function detach(): void {
    container?.removeEventListener('scroll', refresh)
    resizeObserver?.disconnect()
    container = null
    resizeObserver = null
  }

  return {
    isAwayFromLatest: computed(() => awayFromLatest.value),
    jumpToLatest: () => options.scrollToRight(),
    attach,
    detach,
    refresh,
  }
}
