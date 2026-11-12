// 订单流面板的数据状态：轮询、错误、以及「深度失衡的短期波动范围」。
//
// 为什么要自己攒历史：服务端只返回最新快照，而实测两分钟内近端失衡能从 −98% 翻到 +98%。
// 只显示单点数字，交易员会把瞬时噪音当成趋势。这里在客户端保留最近若干次采样，
// 算出区间给面板显示——不改服务端，也不需要额外存储。

import {
  type ComputedRef,
  computed,
  onBeforeUnmount,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue'
import type { OrderflowPanelSource, PanelView } from '../types.js'
import { parsePanel } from './parse-panel.js'

/** 默认刷新间隔：与采集器的 60 秒周期对齐，再快没有新数据。 */
export const DEFAULT_PANEL_REFRESH_MS = 60_000

/** 波动范围样本数：10 次约等于最近 10 分钟。 */
const DEPTH_HISTORY_LIMIT = 10

/** 某个交易所的深度失衡波动范围。 */
export interface DepthRange {
  /** 最小值 */
  readonly min: number
  /** 最大值 */
  readonly max: number
  /** 样本数 */
  readonly count: number
}

/** 面板状态。 */
export interface OrderflowPanelState {
  /** 最新快照 */
  readonly panel: ShallowRef<PanelView | null>
  /** 是否正在加载 */
  readonly loading: ShallowRef<boolean>
  /** 失败原因；成功后清空 */
  readonly error: ShallowRef<string | null>
  /** 最后一次成功的时刻 */
  readonly lastUpdated: ShallowRef<number | null>
  /** 各所近端失衡的短期范围 */
  readonly depthRange: ComputedRef<ReadonlyMap<string, DepthRange>>
  /** 手动刷新 */
  refresh(): Promise<void>
}

/** 构造参数。 */
export interface UseOrderflowPanelOptions {
  /** 数据来源 */
  readonly source: OrderflowPanelSource
  /** 当前品种；返回 null 时不请求 */
  readonly symbol: () => string | null
  /** 刷新间隔 */
  readonly intervalMs?: number
}

/**
 * 创建面板状态。
 *
 * 轮询在组件挂载期间运行，卸载时自动清理；品种变化时立即重新取数并清空波动历史，
 * 否则会把 BTC 的波动范围画到 ETH 卡片上。
 *
 * @param options 数据来源、品种与间隔
 * @returns 面板状态
 */
export function useOrderflowPanel(options: UseOrderflowPanelOptions): OrderflowPanelState {
  const panel = shallowRef<PanelView | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const lastUpdated = shallowRef<number | null>(null)
  const history = shallowRef<Map<string, number[]>>(new Map())

  const intervalMs = options.intervalMs ?? DEFAULT_PANEL_REFRESH_MS
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  const depthRange = computed<ReadonlyMap<string, DepthRange>>(() => {
    const result = new Map<string, DepthRange>()
    for (const [venue, values] of history.value) {
      if (values.length === 0) continue
      let min = values[0]
      let max = values[0]
      for (const value of values) {
        if (value < min) min = value
        if (value > max) max = value
      }
      result.set(venue, { min, max, count: values.length })
    }
    return result
  })

  /**
   * 记录一次采样，保留最近若干条。
   *
   * @param next 新快照
   */
  function recordDepth(next: PanelView): void {
    const updated = new Map(history.value)
    for (const venue of next.venues) {
      if (venue.depth === null) continue
      const series = [...(updated.get(venue.venue) ?? []), venue.depth.nearImbalance]
      updated.set(venue.venue, series.slice(-DEPTH_HISTORY_LIMIT))
    }
    history.value = updated
  }

  async function refresh(): Promise<void> {
    if (inFlight) return
    const symbol = options.symbol()
    if (symbol === null) {
      panel.value = null
      error.value = '当前图表没有可用的品种。'
      return
    }
    inFlight = true
    loading.value = true
    try {
      const raw = await options.source.fetchPanel(symbol)
      const parsed = parsePanel(raw)
      if (parsed === null) {
        error.value = '服务端返回的面板结构不符合预期。'
        return
      }
      panel.value = parsed
      lastUpdated.value = Date.now()
      error.value = null
      recordDepth(parsed)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      inFlight = false
      loading.value = false
    }
  }

  /**
   * 重开轮询定时器。
   */
  function restartTimer(): void {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(() => {
      void refresh()
    }, intervalMs)
  }

  watch(
    () => options.symbol(),
    () => {
      // 换品种时旧历史必须清掉，否则范围条会把上一个品种的波动画到新品种上
      history.value = new Map()
      void refresh()
    },
    { immediate: true },
  )
  restartTimer()

  onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer)
    timer = null
  })

  return { panel, loading, error, lastUpdated, depthRange, refresh }
}
