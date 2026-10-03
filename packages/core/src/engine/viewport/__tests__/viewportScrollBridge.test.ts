/** 验证程序滚动与原生 scroll 事件的单向确认。 */

import { describe, expect, it } from 'vitest'

import { createScrollContainerStub } from '../../__tests__/helpers/scrollContainerStub'
import { ViewportScrollBridge } from '../viewportScrollBridge'

describe('ViewportScrollBridge', () => {
  it('consumes the native event caused by a programmatic frame commit', () => {
    const container = createScrollContainerStub()
    const bridge = new ViewportScrollBridge(() => container)

    bridge.commit(160)

    expect(container.scrollLeft).toBe(160)
    expect(bridge.isExternalScroll(160)).toBe(false)
  })

  it('treats a different native value as user input', () => {
    const container = createScrollContainerStub()
    const bridge = new ViewportScrollBridge(() => container)

    bridge.commit(160)
    container.scrollLeft = 180

    expect(bridge.isExternalScroll(180)).toBe(true)
  })

  it('confirms the browser-accepted value when a target is clamped', () => {
    const container = createScrollContainerStub({ transformScrollLeft: Math.floor })
    const bridge = new ViewportScrollBridge(() => container)

    bridge.commit(160.75)

    expect(container.scrollLeft).toBe(160)
    expect(bridge.isExternalScroll(160)).toBe(false)
  })

  it('submits resized content and anchored scroll before accepting browser clamp events', () => {
    const container = createScrollContainerStub()
    const bridge = new ViewportScrollBridge(() => container)
    let width = '25000px'
    const content = {
      style: {
        get width() {
          return width
        },
        set width(value: string) {
          width = value
          // 缩小内容时浏览器先自动夹取滚动量，原生事件异步派发。
          container.scrollLeft = Math.min(container.scrollLeft, Number.parseFloat(value) - 1000)
        },
      },
    } as HTMLElement
    bridge.commit(24157)
    bridge.commit(22364, { element: content, width: 24200 })
    expect(content.style.width).toBe('24200px')
    expect(container.scrollLeft).toBe(22364)
    // 浏览器夹取可能排入多个事件，都读取提交后的实际值。
    expect(bridge.isExternalScroll(container.scrollLeft)).toBe(false)
    expect(bridge.isExternalScroll(container.scrollLeft)).toBe(false)
    container.scrollLeft = 22200
    expect(bridge.isExternalScroll(container.scrollLeft)).toBe(true)
  })
})
