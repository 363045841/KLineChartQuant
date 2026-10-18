/** 每个浏览器窗口共享一份设备快照，订阅期间监听输入能力与屏幕变化。 */
import { createSubState, type ReadonlySignal } from '../../reactivity/signal.js'
import type { DeviceEnvironment, DeviceType } from '../types.js'

const COARSE_POINTER_QUERY = '(pointer: coarse)'
const environments = new WeakMap<Window, ReadonlySignal<DeviceEnvironment>>()
const serverEnvironment: DeviceEnvironment = Object.freeze({
  deviceType: 'desktop',
  isCoarsePointer: false,
})

/** 检测设备类型；触屏桌面不会仅因指针粗糙而归为移动设备。 */
function detectDeviceType(browser: Window): DeviceType {
  const nav = browser.navigator
  if ('userAgentData' in nav) {
    const hints = nav.userAgentData
    if (typeof hints === 'object' && hints !== null && 'mobile' in hints && hints.mobile === true) {
      return 'mobile'
    }
  }
  const ua = nav.userAgent.toLowerCase()
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return 'tablet'
  if (/iphone|ipod|android.*mobile|webos|blackberry|iemobile|opera mini|mobile/i.test(ua)) {
    return 'mobile'
  }
  // iPadOS 的桌面 UA 与 Mac 相同，通过多点触控识别，避免依赖当前方向的屏幕宽度。
  if (/macintosh/i.test(ua) && nav.maxTouchPoints > 1) return 'tablet'
  return 'desktop'
}

/** 创建窗口环境信号；仅第一个订阅者添加监听，最后一个退订者负责释放。 */
function createDeviceEnvironment(browser: Window): ReadonlySignal<DeviceEnvironment> {
  const pointer = browser.matchMedia(COARSE_POINTER_QUERY)
  const read = (): DeviceEnvironment =>
    Object.freeze({
      deviceType: detectDeviceType(browser),
      isCoarsePointer: pointer.matches,
    })
  const state = createSubState({ environment: read() })
  const signal = state.readonly.environment
  let subscribers = 0
  /** 只有环境字段变化时才发布完整快照。 */
  function refresh(): void {
    const next = read()
    const previous = signal.peek()
    if (
      next.deviceType !== previous.deviceType ||
      next.isCoarsePointer !== previous.isCoarsePointer
    ) {
      state.signals.environment.set(next)
    }
  }
  /** 每次读取也刷新无订阅期间的环境变化。 */
  function peek(): DeviceEnvironment {
    if (subscribers === 0) refresh()
    return signal.peek()
  }
  /** Core effect 读取时仍追踪底层信号，peek 保持不追踪语义。 */
  function current(): DeviceEnvironment {
    if (subscribers === 0) refresh()
    return signal()
  }
  return Object.assign(current, {
    peek,
    subscribe(listener: () => void) {
      if (subscribers === 0) {
        refresh()
        pointer.addEventListener('change', refresh)
        browser.addEventListener('resize', refresh)
      }
      subscribers++
      const unsubscribe = signal.subscribe(listener)
      let active = true
      return () => {
        if (!active) return
        active = false
        unsubscribe()
        if (--subscribers === 0) {
          pointer.removeEventListener('change', refresh)
          browser.removeEventListener('resize', refresh)
        }
      }
    },
  })
}

/** 获取当前窗口的唯一设备状态；SSR 不初始化或缓存浏览器环境。 */
export function getDeviceEnvironment(): ReadonlySignal<DeviceEnvironment> {
  if (typeof window === 'undefined') {
    return createSubState({ environment: serverEnvironment }).readonly.environment
  }
  let environment = environments.get(window)
  if (!environment) {
    environment = createDeviceEnvironment(window)
    environments.set(window, environment)
  }
  return environment
}

/** 设备类型的同步读取入口，与响应式消费者读取同一份状态。 */
export function getDeviceType(): DeviceType {
  return getDeviceEnvironment().peek().deviceType
}
