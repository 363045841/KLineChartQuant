// 期权面板的轮询状态：换标的立即重取，卸载时停表，失败保留上一次成功的数据。

import { onBeforeUnmount, shallowRef, watch, type ShallowRef } from 'vue'
import type { OptionPanelSource, OptionPanelView } from '../types.js'
import { parseOptionSeries } from './parse-option-series.js'

/** 默认刷新间隔：采集器 60 秒一轮，面板跟着采集间隔走就够。 */
const DEFAULT_REFRESH_MS = 60_000

/** 面板状态。 */
export interface OptionPanelState {
  /** 最新快照 */
  readonly view: ShallowRef<OptionPanelView | null>
  /** 是否正在加载 */
  readonly loading: ShallowRef<boolean>
  /** 失败原因；成功后清空 */
  readonly error: ShallowRef<string | null>
  /** 最后一次成功的时刻 */
  readonly lastUpdated: ShallowRef<number | null>
  /** 手动刷新 */
  refresh(): Promise<void>
}

/** 构造参数。 */
export interface UseOptionPanelOptions {
  /** 数据来源 */
  readonly source: OptionPanelSource
  /** 当前图表的期权标的；返回 null 时不请求 */
  readonly underlying: () => string | null
  /** 刷新间隔 */
  readonly intervalMs?: number
}

/**
 * 创建期权面板状态。
 *
 * 轮询只在组件挂载期间运行。换标的时清空上一次的快照，避免把 BTC 的墙位留在 ETH 面板上。
 *
 * @param options 数据来源、标的与间隔
 * @returns 面板状态
 */
export function useOptionPanel(options: UseOptionPanelOptions): OptionPanelState {
  const view = shallowRef<OptionPanelView | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const lastUpdated = shallowRef<number | null>(null)

  const intervalMs = options.intervalMs ?? DEFAULT_REFRESH_MS
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  async function refresh(): Promise<void> {
    if (inFlight) return
    const currency = options.underlying()
    if (currency === null) {
      view.value = null
      error.value = '当前品种没有对应的期权标的。'
      return
    }
    inFlight = true
    loading.value = true
    try {
      const parsed = parseOptionSeries(await options.source.fetchSeries(currency))
      if (parsed === null) {
        error.value = '期权服务返回的结构不符合预期。'
        return
      }
      view.value = parsed
      lastUpdated.value = Date.now()
      error.value = null
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      inFlight = false
      loading.value = false
    }
  }

  watch(
    () => options.underlying(),
    () => {
      view.value = null
      void refresh()
    },
    { immediate: true },
  )

  timer = setInterval(() => {
    void refresh()
  }, intervalMs)

  onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer)
    timer = null
  })

  return { view, loading, error, lastUpdated, refresh }
}
