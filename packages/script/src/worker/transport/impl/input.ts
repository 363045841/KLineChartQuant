/** 行情增量编解码：数据层说从哪根变了，这里只搬变化之后的数值块。 */
import type { Bar, ComputeChange } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptRequestContext } from '../../../request/types.js'
import type { BarPatch, RunInputPatch } from '../types.js'

const BAR_WIDTH = 7
const Closed = { Missing: 0, Undefined: 1, Open: 2, Closed: 3 }

/** closed 的缺省、显式 undefined 与布尔值分别编码，不把历史根错误地变成未收盘。 */
function closedValue(bar: Bar): number {
  if (!Object.hasOwn(bar, 'closed')) return Closed.Missing
  if (bar.closed === undefined) return Closed.Undefined
  return bar.closed ? Closed.Closed : Closed.Open
}

/** 写入通信副本，永远不转移宿主正在使用的行情内存。 */
function writeBar(values: Float64Array, offset: number, bar: Bar): void {
  values[offset] = bar.time
  values[offset + 1] = bar.open
  values[offset + 2] = bar.high
  values[offset + 3] = bar.low
  values[offset + 4] = bar.close
  values[offset + 5] = bar.volume
  values[offset + 6] = closedValue(bar)
}

/** 只打包 [change.start, bars.length)，调用方保证 start 合法。 */
function packBars(bars: readonly Bar[], change: ComputeChange): BarPatch {
  const from = change.kind === 'reset' ? 0 : change.start
  if (from < 0 || from > bars.length)
    throw new RangeError(`行情变化起点越界：${from} / ${bars.length}`)
  const count = bars.length - from
  const values = new Float64Array(count * BAR_WIDTH)
  for (let index = 0; index < count; index++) writeBar(values, index * BAR_WIDTH, bars[from + index]!)
  return {
    change: change.kind === 'reset' ? { ...change, start: 0 } : change,
    length: bars.length,
    buffer: values.buffer,
  }
}

/** 组帧：修订号不连续时整帧按全量发送，Worker 不需要知道历史。 */
export function encodeRunInput(
  input: {
    readonly bars: readonly Bar[]
    readonly change: ComputeChange
    readonly context?: ScriptRequestContext
  },
  reset: boolean,
): RunInputPatch {
  const change: ComputeChange = reset
    ? { kind: 'reset', start: 0, revision: input.change.revision }
    : input.change
  const bars = packBars(input.bars, change)
  if (!input.context) return { bars }
  const snapshots = input.context.snapshots.map((snapshot) => ({
    id: snapshot.id,
    bars: packBars(
      snapshot.bars,
      reset ? { ...snapshot.change, kind: 'reset', start: 0 } : snapshot.change,
    ),
  }))
  return { bars, context: { ...input.context, snapshots } }
}

/** 只传非空通信块；空块用于表达空序列，不占转移列表。 */
export function inputTransferList(input: RunInputPatch): ArrayBuffer[] {
  const buffers = [input.bars.buffer]
  for (const snapshot of input.context?.snapshots ?? []) buffers.push(snapshot.bars.buffer)
  return buffers.filter((buffer) => buffer.byteLength > 0)
}

/** 把一段数值块写进当前序列；无法应用说明修订不连续，直接报错。 */
function applyPatch(current: Bar[], patch: BarPatch): readonly Bar[] {
  const values = new Float64Array(patch.buffer)
  const from = patch.change.start
  const count = patch.length - from
  if (
    from < 0 ||
    from > current.length ||
    from + count !== patch.length ||
    values.length !== count * BAR_WIDTH
  )
    throw new RangeError('Worker 行情增量与当前序列不匹配')
  if (patch.change.kind === 'reset') current.length = 0
  if (from > current.length) throw new RangeError('Worker 行情增量缺少前置数据')
  current.length = from
  current.length = patch.length
  for (let index = 0; index < count; index++) {
    const target = from + index
    const offset = index * BAR_WIDTH
    const bar: Bar = {
      time: values[offset]!,
      open: values[offset + 1]!,
      high: values[offset + 2]!,
      low: values[offset + 3]!,
      close: values[offset + 4]!,
      volume: values[offset + 5]!,
    }
    const closed = values[offset + 6]!
    if (closed !== Closed.Missing) {
      bar.closed = closed === Closed.Undefined ? undefined : closed === Closed.Closed
    }
    current[target] = bar
  }
  return current
}

/** 解码状态只存在于 Worker；计算错误不撤销已经同步成功的行情。 */
export class WorkerInputReceiver {
  private main: Bar[] = []
  private snapshots = new Map<string, Bar[]>()

  /** 先同步输入再执行脚本，下一次请求不依赖上次计算是否成功。 */
  decode(input: RunInputPatch): { bars: readonly Bar[]; context?: ScriptRequestContext } {
    const bars = applyPatch(this.main, input.bars)
    if (!input.context) return { bars }
    const next = new Map<string, Bar[]>()
    const snapshots = input.context.snapshots.map((snapshot) => {
      const receiver = this.snapshots.get(snapshot.id) ?? []
      next.set(snapshot.id, receiver as Bar[])
      return {
        id: snapshot.id,
        bars: applyPatch(receiver as Bar[], snapshot.bars),
        change: snapshot.bars.change,
      }
    })
    this.snapshots = next
    return { bars, context: { ...input.context, snapshots } }
  }
}
