/** 每个浏览器窗口共享一份设备快照，订阅期间监听输入能力与屏幕变化。 */
import { createSubState, type ReadonlySignal } from '../../reactivity/signal.js'
import type { DeviceEnvironment, DeviceType } from '../types.js'

const COARSE_POINTER_QUERY = '(pointer: coarse)'
const environments = new WeakMap<Window, ReadonlySignal<DeviceEnvironment>>()
const serverEnvironment: DeviceEnvironment = Object.freeze({
  deviceType: 'desktop',
  isCoarsePointer: false,
  resolved: true,
})

/** UA-CH 异步表单因子查询的最小契约；DOM lib 尚未声明 userAgentData，按结构收窄。 */
type FormFactorProbe = {
  getHighEntropyValues: (hints: string[]) => Promise<{ formFactors?: readonly string[] }>
}

/** 判断 Client Hints 对象是否提供异步表单因子查询。 */
function isFormFactorProbe(value: unknown): value is FormFactorProbe {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getHighEntropyValues' in value &&
    typeof value.getHighEntropyValues === 'function'
  )
}

/** 读取当前窗口的 Client Hints 对象；浏览器未提供时返回 undefined。 */
function readClientHints(browser: Window): unknown {
  return 'userAgentData' in browser.navigator ? browser.navigator.userAgentData : undefined
}

/** 把 UA-CH 表单因子映射为设备类型；只认已知值，其余保留同步估计。 */
function mapFormFactors(formFactors: readonly string[] | undefined): DeviceType | null {
  if (!formFactors || formFactors.length === 0) return null
  // 可拆卸设备可能同时报告 Desktop 与 Tablet，继续把触屏电脑视为桌面。
  if (formFactors.includes('Desktop')) return 'desktop'
  if (formFactors.includes('Tablet')) return 'tablet'
  if (formFactors.includes('Mobile') || formFactors.includes('Watch')) return 'mobile'
  return null
}

/** 检测设备类型；桌面 UA 的平板由输入能力兜底，不把粗指针直接视为移动设备。 */
function detectDeviceType(browser: Window, coarsePointer: boolean): DeviceType {
  const nav = browser.navigator
  const hints = readClientHints(browser)
  if (typeof hints === 'object' && hints !== null && 'mobile' in hints && hints.mobile === true) {
    return 'mobile'
  }
  const ua = nav.userAgent.toLowerCase()
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return 'tablet'
  if (/iphone|ipod|android.*mobile|webos|blackberry|iemobile|opera mini|mobile/i.test(ua)) {
    return 'mobile'
  }
  // iPadOS 的桌面 UA 与 Mac 相同，通过多点触控识别，避免依赖当前方向的屏幕宽度。
  if (/macintosh/i.test(ua) && nav.maxTouchPoints > 1) return 'tablet'
  // Chrome 在 Android 平板上默认使用桌面 UA，UA 已不含 Android/Tablet 标记；
  // 触屏电脑保留桌面类型，避免把带鼠标或触控板的设备误判为平板。
  if (nav.maxTouchPoints > 1 && coarsePointer && !/windows/i.test(ua)) return 'tablet'
  return 'desktop'
}

/** 创建窗口环境信号；仅第一个订阅者添加监听，最后一个退订者负责释放。 */
function createDeviceEnvironment(browser: Window): ReadonlySignal<DeviceEnvironment> {
  const pointer = browser.matchMedia(COARSE_POINTER_QUERY)
  const hints = readClientHints(browser)
  const probe = isFormFactorProbe(hints) ? hints : undefined
  let formFactor: DeviceType | null = null
  let resolved = probe === undefined

  /** 当前完整快照；formFactors 结算后优先于同步估计。 */
  const read = (): DeviceEnvironment =>
    Object.freeze({
      deviceType: formFactor ?? detectDeviceType(browser, pointer.matches),
      isCoarsePointer: pointer.matches,
      resolved,
    })

  const state = createSubState({ environment: read() })
  const signal = state.readonly.environment
  let subscribers = 0

  /** 只有完整快照字段变化时才发布。 */
  function refresh(): void {
    const next = read()
    const previous = signal.peek()
    if (
      next.deviceType !== previous.deviceType ||
      next.isCoarsePointer !== previous.isCoarsePointer ||
      next.resolved !== previous.resolved
    ) {
      state.signals.environment.set(next)
    }
  }

  /** 异步查询只发一次；拒绝或字段缺失时结算为同步估计，避免编辑器永久等待。 */
  function startProbe(source: FormFactorProbe): void {
    const settle = (next: DeviceType | null): void => {
      formFactor = next
      resolved = true
      refresh()
    }
    try {
      void source.getHighEntropyValues(['formFactors']).then(
        (values) => settle(mapFormFactors(values.formFactors)),
        () => settle(null),
      )
    } catch {
      settle(null)
    }
  }
  if (probe) startProbe(probe)

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
