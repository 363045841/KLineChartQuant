// @vitest-environment jsdom
/** 验证设备分类、同步兜底、窗口共享、输入能力更新和监听释放。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeviceEnvironment, getDeviceType } from '../impl/deviceEnvironment.js'

const events = new EventTarget()
let isCoarsePointer = false
const pointer = {
  get matches(): boolean {
    return isCoarsePointer
  },
  media: '(pointer: coarse)',
  onchange: null,
  addEventListener: vi.fn(events.addEventListener.bind(events)),
  removeEventListener: vi.fn(events.removeEventListener.bind(events)),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: events.dispatchEvent.bind(events),
} satisfies MediaQueryList

/** 设置浏览器提供的设备信息，不通过待测实现构造预期结果。 */
function setDevice(userAgent: string, touches = 0): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: touches })
}

beforeEach(() => {
  isCoarsePointer = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => pointer),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window.navigator, 'maxTouchPoints')
  Reflect.deleteProperty(window.navigator, 'userAgentData')
})

describe('设备环境', () => {
  it.each([
    ['Mozilla/5.0 (iPhone) Mobile', 5, false, 'mobile'],
    ['Mozilla/5.0 (Linux; Android 14) Mobile', 5, false, 'mobile'],
    ['Mozilla/5.0 (Linux; Android 14)', 5, false, 'tablet'],
    ['Mozilla/5.0 (iPad)', 5, false, 'tablet'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5, false, 'tablet'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0, false, 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0)', 10, false, 'desktop'],
    ['Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36', 5, true, 'tablet'],
    ['Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36', 5, false, 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0)', 10, true, 'desktop'],
  ])('识别 %s（触点 %i，粗指针 %s）为 %s', (ua, touches, coarse, expected) => {
    isCoarsePointer = coarse
    setDevice(ua, touches)
    expect(getDeviceType()).toBe(expected)
  })

  it('优先读取 Client Hints 的手机标记', () => {
    setDevice('Mozilla/5.0')
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { mobile: true },
    })
    expect(getDeviceType()).toBe('mobile')
  })

  it('共享状态并按订阅生命周期更新输入能力，触屏电脑仍为桌面', () => {
    setDevice('Mozilla/5.0 (Windows NT 10.0)', 10)
    const environment = getDeviceEnvironment()
    expect(getDeviceEnvironment()).toBe(environment)
    expect(environment.peek()).toEqual({
      deviceType: 'desktop',
      isCoarsePointer: false,
      resolved: true,
    })
    const listener = vi.fn()
    const removeResize = vi.spyOn(window, 'removeEventListener')
    const stopFirst = environment.subscribe(listener)
    const stopSecond = environment.subscribe(vi.fn())
    try {
      isCoarsePointer = true
      pointer.dispatchEvent(new Event('change'))
      expect(environment.peek()).toEqual({
        deviceType: 'desktop',
        isCoarsePointer: true,
        resolved: true,
      })
      expect(listener).toHaveBeenCalledOnce()
      stopFirst()
      expect(pointer.removeEventListener).not.toHaveBeenCalled()
    } finally {
      stopFirst()
      stopSecond()
    }
    expect(pointer.removeEventListener).toHaveBeenCalledOnce()
    expect(removeResize).toHaveBeenCalledWith('resize', expect.any(Function))
    isCoarsePointer = false
    expect(environment.peek().isCoarsePointer).toBe(false)
  })

  it('SSR 读取不会缓存到后续浏览器设备状态', () => {
    setDevice('Mozilla/5.0 (iPhone) Mobile', 5)
    vi.stubGlobal('window', undefined)
    expect(getDeviceType()).toBe('desktop')
    vi.unstubAllGlobals()
    expect(getDeviceType()).toBe('mobile')
  })
})
