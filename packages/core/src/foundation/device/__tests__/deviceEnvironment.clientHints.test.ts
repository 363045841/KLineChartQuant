// @vitest-environment jsdom
/** 验证 UA-CH formFactors 的异步结算、优先级与失败回退。 */
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

/** 设置浏览器提供的设备信息，不通过待测实现构造预期结果。 */
function setDevice(userAgent = DESKTOP_UA, touches = 5): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: touches })
}

/** 设置 Client Hints；查询结果由用例决定。 */
function setClientHints(
  getHighEntropyValues: () => Promise<{ formFactors?: string[] }>,
): void {
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: { mobile: false, getHighEntropyValues },
  })
}

describe('设备环境的 Client Hints 结算', () => {
  it('结算前发布同步估计，结算后用 formFactors 覆盖', async () => {
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

  it('Desktop 表单因子保持桌面类型', async () => {
    setClientHints(() => Promise.resolve({ formFactors: ['Desktop'] }))
    setDevice()
    const environment = getDeviceEnvironment()
    expect(environment.peek().resolved).toBe(false)
    await vi.waitFor(() =>
      expect(environment.peek()).toEqual({
        deviceType: 'desktop',
        isCoarsePointer: false,
        resolved: true,
      }),
    )
  })

  it('Mobile 表单因子覆盖桌面 UA', async () => {
    setClientHints(() => Promise.resolve({ formFactors: ['Mobile'] }))
    setDevice()
    const environment = getDeviceEnvironment()
    await vi.waitFor(() =>
      expect(environment.peek()).toEqual({
        deviceType: 'mobile',
        isCoarsePointer: false,
        resolved: true,
      }),
    )
  })

  it('可拆卸设备同时报告 Desktop 与 Tablet 时保持桌面策略', async () => {
    setClientHints(() => Promise.resolve({ formFactors: ['Desktop', 'Tablet'] }))
    setDevice()
    const environment = getDeviceEnvironment()
    await vi.waitFor(() =>
      expect(environment.peek()).toEqual({
        deviceType: 'desktop',
        isCoarsePointer: false,
        resolved: true,
      }),
    )
  })

  it('查询被拒绝时保留同步估计并结算', async () => {
    setClientHints(() => Promise.reject(new Error('denied')))
    setDevice()
    const environment = getDeviceEnvironment()
    await vi.waitFor(() => expect(environment.peek().resolved).toBe(true))
    expect(environment.peek().deviceType).toBe('desktop')
  })

  it('结果没有 formFactors 时保留同步估计并结算', async () => {
    setClientHints(() => Promise.resolve({}))
    setDevice()
    const environment = getDeviceEnvironment()
    await vi.waitFor(() => expect(environment.peek().resolved).toBe(true))
    expect(environment.peek().deviceType).toBe('desktop')
  })

  it('没有异步表单因子能力时立即结算', () => {
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

  it('重复读取不会重复查询', async () => {
    const getHighEntropyValues = vi.fn(() => Promise.resolve({ formFactors: ['Tablet'] }))
    setClientHints(getHighEntropyValues)
    setDevice()
    const environment = getDeviceEnvironment()
    environment.peek()
    environment.peek()
    await vi.waitFor(() => expect(environment.peek().resolved).toBe(true))
    expect(getHighEntropyValues).toHaveBeenCalledOnce()
  })

  it('结算前仍用粗指针兜底识别桌面 UA 平板', () => {
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
