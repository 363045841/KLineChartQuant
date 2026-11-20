// @vitest-environment jsdom
/** 验证 UA-CH formFactors 的异步折算、优先级与失败回退。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let pointerMatches = false
const pointer = {
  get matches(): boolean {
    return pointerMatches
  },
  media: '(pointer: coarse)',
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => false),
} satisfies MediaQueryList

let getDeviceEnvironment: (typeof import('../impl/deviceEnvironment.js'))['getDeviceEnvironment']

beforeEach(async () => {
  vi.resetModules()
  pointerMatches = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => pointer),
  )
  ;({ getDeviceEnvironment } = await import('../impl/deviceEnvironment.js'))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window.navigator, 'maxTouchPoints')
  Reflect.deleteProperty(window.navigator, 'userAgentData')
})

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36'

/** 覆盖 UA 与触点数量，构造可预期的同步探测结果。 */
function setDevice(userAgent = DESKTOP_UA, touches = 5): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: touches })
}

/** 注入 Client Hints 查询函数，模拟提示接口可用。 */
function setClientHints(
  getHighEntropyValues: () => Promise<{ formFactors?: string[] }>,
): void {
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: { mobile: false, getHighEntropyValues },
  })
}

describe('设备类型 · Client Hints 折算', () => {
  it('异步提示返回前先给出同步结果，返回后覆盖 formFactors 结果', async () => {
    let resolveHints: (value: { formFactors?: string[] }) => void = () => {}
    setClientHints(
      () =>
        new Promise((resolve) => {
          resolveHints = resolve
        }),
    )
    setDevice()
    const environment = getDeviceEnvironment()
    expect(environment.peek()).toEqual({
      deviceType: 'desktop',
      isCoarsePointer: false,
      resolved: false,
    })

    resolveHints({ formFactors: ['Tablet'] })
    await vi.waitFor(() =>
      expect(environment.peek()).toEqual({
        deviceType: 'tablet',
        isCoarsePointer: false,
        resolved: true,
      }),
    )
  })

  it.each([
    {
      name: 'Desktop',
      hints: () => Promise.resolve({ formFactors: ['Desktop'] }),
      deviceType: 'desktop',
    },
    {
      name: 'Mobile',
      hints: () => Promise.resolve({ formFactors: ['Mobile'] }),
      deviceType: 'mobile',
    },
    {
      name: 'Desktop 优先于 Tablet',
      hints: () => Promise.resolve({ formFactors: ['Desktop', 'Tablet'] }),
      deviceType: 'desktop',
    },
    {
      name: '查询被拒绝时回退同步探测',
      hints: () => Promise.reject(new Error('denied')),
      deviceType: 'desktop',
    },
    {
      name: '缺少 formFactors 时回退同步探测',
      hints: () => Promise.resolve({}),
      deviceType: 'desktop',
    },
  ])('$name → $deviceType', async ({ hints, deviceType }) => {
    setClientHints(hints)
    setDevice()
    const environment = getDeviceEnvironment()
    await vi.waitFor(() =>
      expect(environment.peek()).toEqual({
        deviceType,
        isCoarsePointer: false,
        resolved: true,
      }),
    )
  })

  it('没有异步提示接口时同步完成', () => {
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { mobile: false },
    })
    setDevice()
    expect(getDeviceEnvironment().peek()).toEqual({
      deviceType: 'desktop',
      isCoarsePointer: false,
      resolved: true,
    })
  })

  it('重复读取不重复发起查询', async () => {
    const getHighEntropyValues = vi.fn(() => Promise.resolve({ formFactors: ['Tablet'] }))
    setClientHints(getHighEntropyValues)
    setDevice()
    const environment = getDeviceEnvironment()
    environment.peek()
    environment.peek()
    await vi.waitFor(() => expect(environment.peek().resolved).toBe(true))
    expect(getHighEntropyValues).toHaveBeenCalledOnce()
  })

  it('异步返回前就按粗指针识别为平板并保留 UA 兜底', () => {
    pointerMatches = true
    setClientHints(() => new Promise(() => {}))
    setDevice()
    expect(getDeviceEnvironment().peek()).toEqual({
      deviceType: 'tablet',
      isCoarsePointer: true,
      resolved: false,
    })
  })
})
