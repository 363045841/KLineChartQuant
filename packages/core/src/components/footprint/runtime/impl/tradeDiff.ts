/** 足迹 Worker 的成交增量传输，历史批次修订时显式整段替换。 */
import type { TradeSnapshot } from '@/data/trades/types.js'
import type { FootprintTradeDiff } from '../types.js'

/** 引用前缀不变时只克隆新增批次，状态与覆盖水位仍随每个请求传输。 */
export function diffFootprintTrades(previous: TradeSnapshot | undefined, next: TradeSnapshot): FootprintTradeDiff {
  if (previous && next.batches.length >= previous.batches.length &&
    previous.batches.every((batch, index) => batch === next.batches[index])) {
    return { mode: 'append', snapshot: { ...next, batches: next.batches.slice(previous.batches.length) } }
  }
  return { mode: 'replace', snapshot: next }
}
