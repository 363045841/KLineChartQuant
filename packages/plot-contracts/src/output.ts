/** 脚本输出的可克隆契约，供执行器、宿主服务和编辑器共同消费。 */
import type { Bar } from './bar.js'
import type { IndicatorMarketContext } from './market.js'

/** 当前草稿的一次调试执行，不注册或持久化指标。 */
export interface ScriptRunOptions {
  readonly outputId: string
  readonly source: string
  readonly trusted: boolean
  readonly bars: readonly Bar[]
  readonly market: IndicatorMarketContext
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

/** 一次 console 调用；顶层输出的 barIndex 为 -1。 */
export interface LogEvent {
  kind: 'log'
  level: LogLevel
  /** 输出发生的 UTC 毫秒时间戳。 */
  time: number
  barIndex: number
  message: string
}

/** 按脚本身份订阅有界输出快照；返回值释放订阅。 */
export interface ScriptOutputSource {
  subscribe(id: string, listener: (events: readonly LogEvent[]) => void): () => void
  clear(id: string): void
}

/** 每个脚本与每次跨线程传输最多保留的日志条数。 */
export const SCRIPT_OUTPUT_LIMIT = 1000
