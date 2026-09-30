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
})
