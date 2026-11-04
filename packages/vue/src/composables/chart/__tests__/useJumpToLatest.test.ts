/** 「回到最新 K 线」浮钮的可见性判定与监听生命周期。 */
import { describe, expect, it, vi } from 'vitest'
import { hasHiddenHistory, useJumpToLatest } from '../useJumpToLatest'

/** 构造带固定滚动几何的容器，避免依赖真实布局。 */
function createScrollContainer(geometry: {
  readonly scrollWidth: number
  readonly clientWidth: number
}): { readonly element: HTMLDivElement; setScrollLeft: (value: number) => void } {
  const element = document.createElement('div')
  let scrollLeft = 0
  Object.defineProperty(element, 'scrollWidth', { value: geometry.scrollWidth, configurable: true })
  Object.defineProperty(element, 'clientWidth', { value: geometry.clientWidth, configurable: true })
  Object.defineProperty(element, 'scrollLeft', {
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value
    },
    configurable: true,
  })
  return {
    element,
    setScrollLeft: (value: number) => {
      element.scrollLeft = value
    },
  }
}

describe('hasHiddenHistory', () => {
  it('右侧无余量时视为已在最新处', () => {
    expect(hasHiddenHistory(600, 1000, 400)).toBe(false)
  })

  it('右侧仍有余量时视为离开最新处', () => {
    expect(hasHiddenHistory(0, 1000, 400)).toBe(true)
  })

  it('内容不足一屏时始终视为已最新', () => {
    expect(hasHiddenHistory(0, 400, 400)).toBe(false)
  })

  it('余量在容差内不触发', () => {
    expect(hasHiddenHistory(599, 1000, 400)).toBe(false)
  })
})

describe('useJumpToLatest', () => {
  it('jumpToLatest 直接委托注入的滚回动作', () => {
    const scrollToRight = vi.fn()
    const handle = useJumpToLatest({ scrollToRight })

    handle.jumpToLatest()

    expect(scrollToRight).toHaveBeenCalledTimes(1)
  })

  it('attach 后按容器几何给出可见性，滚动时同步刷新', () => {
    const scrollToRight = vi.fn()
    const handle = useJumpToLatest({ scrollToRight })
    const { element, setScrollLeft } = createScrollContainer({
      scrollWidth: 1000,
      clientWidth: 400,
    })

    handle.attach(element)
    expect(handle.isAwayFromLatest.value).toBe(true)

    setScrollLeft(600)
    element.dispatchEvent(new Event('scroll'))
    expect(handle.isAwayFromLatest.value).toBe(false)

    handle.detach()
  })

  it('detach 后不再响应滚动并保持最后一次状态', () => {
    const handle = useJumpToLatest({ scrollToRight: vi.fn() })
    const { element, setScrollLeft } = createScrollContainer({
      scrollWidth: 1000,
      clientWidth: 400,
    })

    handle.attach(element)
    handle.detach()
    setScrollLeft(600)
    element.dispatchEvent(new Event('scroll'))

    expect(handle.isAwayFromLatest.value).toBe(true)
  })

  it('容器未绑定时 refresh 不改变可见性', () => {
    const handle = useJumpToLatest({ scrollToRight: vi.fn() })

    handle.refresh()

    expect(handle.isAwayFromLatest.value).toBe(false)
  })
})
