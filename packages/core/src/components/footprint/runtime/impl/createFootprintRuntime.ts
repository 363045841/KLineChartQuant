/** 足迹主序列运行模块：合并更新、隔离过期结果，并按模式启停计算资源。 */
import { TRADE_STATUS, type TradeSnapshot } from '@/data/trades/types.js'
import type { ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { FootprintInput, FootprintResult, FootprintWorkerRequest, FootprintWorkerResponse } from '../types.js'
import { createFootprintExecution } from './footprintExecution.js'
import { diffFootprintTrades } from './tradeDiff.js'

/** Worker 只在足迹启用时创建；SSR 使用相同执行核心。 */
function createWorker(): Worker | null {
  return typeof Worker === 'undefined' ? null : new Worker(new URL('./footprint.worker.js', import.meta.url), { type: 'module' })
}

/** 连接内核输入与结果 Action；执行器不持有网络连接，也不写用户设置。 */
export function createFootprintRuntime(options: {
  readonly input$: ReadonlySignal<FootprintInput | null>
  readonly commit: (result: FootprintResult | null) => void
  readonly createWorker?: () => Worker | null
}) {
  let worker: Worker | null = null
  let inline: ReturnType<typeof createFootprintExecution> | null = null
  let previousTrades: TradeSnapshot | undefined
  let previousMarket: string | null = null
  let inFlight: { requestId: number; input: FootprintInput } | null = null
  let pending: FootprintInput | null = null
  let nextRequestId = 0
  let disposed = false

  /** 停止后不接受旧 Worker 的回调，所有私有聚合缓存一并释放。 */
  function release(): void {
    worker?.terminate()
    worker = null
    inline = null
    previousTrades = undefined
    previousMarket = null
    inFlight = null
    pending = null
  }

  /** 完成一个任务后只提交当前输入，随后执行等待中的最新快照。 */
  function receive(response: FootprintWorkerResponse): void {
    const current = inFlight
    if (disposed || !current || response.requestId !== current.requestId) return
    inFlight = null
    if (current.input === options.input$.peek()) {
      options.commit({ input: current.input, series: 'series' in response ? response.series : {
        bars: [], rowSize: '0', latestTimestamp: current.input.trades.latestTimestamp,
        status: TRADE_STATUS.error, message: response.error,
      } })
    }
    dispatch()
  }

  /** 单个在途任务加一个最新待办，避免逐笔高频更新堆积计算队列。 */
  function dispatch(): void {
    if (disposed || inFlight || !pending) return
    const input = pending
    pending = null
    if (!worker && !inline) {
      try { worker = (options.createWorker ?? createWorker)() } catch { worker = null }
      if (worker) {
        const activeWorker = worker
        worker.onmessage = (event: MessageEvent<FootprintWorkerResponse>) => receive(event.data)
        worker.onerror = () => {
          if (worker !== activeWorker || disposed) return
          // Worker 不可用时释放其增量身份，用完整输入重新执行当前任务。
          const latest = options.input$.peek()
          release()
          inline = createFootprintExecution()
          pending = latest
          dispatch()
        }
      } else inline = createFootprintExecution()
    }
    const request: FootprintWorkerRequest = {
      requestId: ++nextRequestId, marketKey: input.marketKey, data: input.data, params: input.params,
      trades: diffFootprintTrades(previousMarket === input.marketKey ? previousTrades : undefined, input.trades),
    }
    previousMarket = input.marketKey
    previousTrades = input.trades
    inFlight = { requestId: request.requestId, input }
    if (worker) worker.postMessage(request)
    else if (inline) {
      const execute = inline
      // 合并同一批同步状态更新，避免在 signal 通知栈内提交计算结果。
      queueMicrotask(() => {
        if (!disposed && inFlight?.requestId === request.requestId) receive(execute(request))
      })
    }
  }

  /** 模式退出时释放执行器；市场变化立即撤销旧结果的提交资格。 */
  function update(): void {
    const input = options.input$.peek()
    if (!input) {
      release()
      options.commit(null)
      return
    }
    if (previousMarket !== null && previousMarket !== input.marketKey) {
      release()
      options.commit(null)
    }
    pending = input
    dispatch()
  }
  const unsubscribe = options.input$.subscribe(update)
  update()
  return {
    /** 销毁后解除监听、关闭 Worker 并清空内核结果。 */
    dispose(): void {
      if (disposed) return
      disposed = true
      unsubscribe()
      release()
      options.commit(null)
    },
  }
}
