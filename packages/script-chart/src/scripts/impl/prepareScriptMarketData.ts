/**
 * 脚本取数阶段：声明请求、等待行情快照，再把目标序列的变化交给会话。
 *
 * 网络等待始终发生在池外；目标序列由本适配器持有上一份快照，变化在这里描述一次。
 */
import {
  type Bar,
  type ComputeChange,
  DEFAULT_INTRABAR_LIMIT,
  DEFAULT_REQUEST_BARS,
  type IndicatorMarketContext,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptWorkerPool } from '@363045841yyt/klinechart-script/worker'

/** 每个目标序列已加载的快照与修订号；由执行器持有，释放句柄时一并删除。 */
export interface RequestSnapshotState {
  readonly bars: readonly Bar[]
  readonly revision: number
}
export type RequestSnapshots = Map<string, RequestSnapshotState>

/** 单根 bar 逐字段比较；closed 的缺省与显式 undefined 保持不同语义。 */
function sameBar(previous: Bar, next: Bar): boolean {
  return (
    previous.time === next.time &&
    previous.open === next.open &&
    previous.high === next.high &&
    previous.low === next.low &&
    previous.close === next.close &&
    previous.volume === next.volume &&
    previous.closed === next.closed &&
    Object.hasOwn(previous, 'closed') === Object.hasOwn(next, 'closed')
  )
}

/** 目标序列的变化：只有追加与尾部修订可增量，其余整段重放。 */
function diffBars(
  previous: readonly Bar[] | undefined,
  next: readonly Bar[],
): Pick<ComputeChange, 'kind' | 'start'> {
  if (previous === undefined || previous.length === 0) return { kind: 'reset', start: 0 }
  if (next.length > previous.length) {
    for (let index = 0; index < previous.length; index++)
      if (!sameBar(previous[index]!, next[index]!)) return { kind: 'reset', start: 0 }
    return { kind: 'append', start: previous.length }
  }
  if (next.length === previous.length) {
    let start = next.length - 1
    while (start > 0 && sameBar(previous[start]!, next[start]!)) start--
    return { kind: 'update', start: Math.max(0, start) }
  }
  return { kind: 'reset', start: 0 }
}

/** Worker 只参与短暂的请求声明求值，网络等待始终由行情仓库负责。 */
export async function prepareScriptMarketData(
  worker: ScriptWorkerPool,
  handle: string,
  params: Readonly<Record<string, number | string | boolean>>,
  market: IndicatorMarketContext,
  tracker: RequestSnapshots,
): Promise<ReturnType<typeof buildContext>> {
  market.signal?.throwIfAborted()
  const requests = await worker.requests(handle, {
    params,
    symbol: market.symbol,
    signal: market.signal,
  })
  const snapshots = await Promise.all(
    requests.map(async (request) => {
      const bars = await market.loadBars(
        {
          symbol: request.symbol,
          mode: request.mode,
          ignoreInvalidTimeframe: request.ignoreInvalidTimeframe,
          timeframe: request.timeframe,
          source: request.source,
          calcBarsCount:
            request.calcBarsCount ??
            (request.mode === 'lower_tf' ? DEFAULT_INTRABAR_LIMIT : DEFAULT_REQUEST_BARS),
        },
        market.signal,
      )
      const previous = tracker.get(request.id)
      const patch = diffBars(previous?.bars, bars)
      const revision = (previous?.revision ?? 0) + 1
      const change: ComputeChange = { ...patch, revision }
      tracker.set(request.id, { bars, revision })
      return { id: request.id, bars, change }
    }),
  )
  market.signal?.throwIfAborted()
  return buildContext(market, snapshots)
}

/** 组装会话需要的请求上下文。 */
function buildContext(
  market: IndicatorMarketContext,
  snapshots: readonly {
    readonly id: string
    readonly bars: readonly Bar[]
    readonly change: ComputeChange
  }[],
) {
  return { symbol: market.symbol, time: market.time, snapshots }
}
