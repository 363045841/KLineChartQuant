/**
 * viewportState 测试的依赖夹具。
 *
 * 用真实 signal 构造依赖，替代各用例手写的 `() => value as any`，
 * 让依赖形状在编译期受 `ViewportSignalDeps` 约束。
 */

import { createSignal } from '@/foundation/reactivity/signal'

/** 测试用 viewport options（kGap 为历史字段，当前由 kWidth 推导，仅保留形状）。 */
export interface TestViewportOptions {
  bottomAxisHeight: number
  kWidth: number
  kGap: number
}

/** `createViewportStateDeps` 的覆盖项。 */
export interface ViewportStateDepsOverrides {
  /** options 覆盖，与默认值浅合并。 */
  options?: Partial<TestViewportOptions>
  /** 数据长度，默认 100。 */
  dataLength?: number
  /** 周期，默认 daily。 */
  period?: string
  /** 缩放级别，默认 5。 */
  zoomLevel?: number
  /** 分时槽位数，默认 240。 */
  sessionSlots?: number
}

/**
 * 构造 viewportState 的 signal 依赖，返回可写 signal 供用例改写。
 * @param overrides 覆盖默认依赖值。
 * @returns 满足 ViewportSignalDeps 的可写 signal 集合。
 */
export function createViewportStateDeps(overrides: ViewportStateDepsOverrides = {}) {
  const options$ = createSignal<TestViewportOptions>({
    bottomAxisHeight: 30,
    kWidth: 8,
    kGap: 2,
    ...overrides.options,
  })
  const dataLength$ = createSignal(overrides.dataLength ?? 100)
  const period$ = createSignal(overrides.period ?? 'daily')
  const zoomLevel$ = createSignal(overrides.zoomLevel ?? 5)
  const sessionSlots$ = createSignal(overrides.sessionSlots ?? 240)
  return { options$, dataLength$, period$, zoomLevel$, sessionSlots$ }
}
