/** 每个物理 Worker 一份当前输入：按数值比较行情，传输变化尾段，退出数据集立即释放旧快照。 */
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptOptionLevels } from '../../../option/types.js'
import type { ScriptRequestContext } from '../../../request/types.js'
import type { BarPatch, RunInputPatch } from '../types.js'

/** 单根行情的通信宽度：time、OHLC、volume、closed 码，以及主动买量（缺失编码为 NaN）。 */
export const BAR_WIDTH = 8
const Closed = { Missing: 0, Undefined: 1, Open: 2, Closed: 3 }

/** 主动买量只有按方向拆分的交易所才提供；缺失编码成 NaN，接收端据此不写该字段。 */
function buyVolumeValue(bar: Bar): number {
  return bar.buyVolume === undefined ? Number.NaN : bar.buyVolume
}

/** closed 的缺省、显式 undefined 与布尔值分别编码，不把历史根错误地变成未收盘。 */
function closedValue(bar: Bar): number {
  if (!Object.hasOwn(bar, 'closed')) return Closed.Missing
  if (bar.closed === undefined) return Closed.Undefined
  return bar.closed ? Closed.Closed : Closed.Open
}

/** 用独立数值快照比较，调用方原地改末根也不会被引用相等漏掉。 */
function equalBar(previous: Float64Array, offset: number, bar: Bar): boolean {
  return (
    Object.is(previous[offset], bar.time) &&
    Object.is(previous[offset + 1], bar.open) &&
    Object.is(previous[offset + 2], bar.high) &&
    Object.is(previous[offset + 3], bar.low) &&
    Object.is(previous[offset + 4], bar.close) &&
    Object.is(previous[offset + 5], bar.volume) &&
    previous[offset + 6] === closedValue(bar) &&
    Object.is(previous[offset + 7], buyVolumeValue(bar))
  )
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
  values[offset + 7] = buyVolumeValue(bar)
}

/** 单条序列只保存最近一次输入；扫描比较不创建对象，只为变化块分配通信内存。 */
class BarSender {
  private previous = new Float64Array(0)

  /** 旧序列是否整体后移到新前缀之后；是则只发新增前缀。 */
  private isPrepend(bars: readonly Bar[], prepended: number): boolean {
    const previousLength = this.previous.length / BAR_WIDTH
    for (let index = 0; index < previousLength; index++) {
      if (!equalBar(this.previous, index * BAR_WIDTH, bars[index + prepended]!)) return false
    }
    return true
  }

  /** 前置插入：只发送新增前缀，并把本地基线整体右移。 */
  private prepend(bars: readonly Bar[], prepended: number): BarPatch {
    const values = new Float64Array(prepended * BAR_WIDTH)
    for (let index = 0; index < prepended; index++) {
      writeBar(values, index * BAR_WIDTH, bars[index]!)
    }
    const previous = new Float64Array(bars.length * BAR_WIDTH)
    previous.set(this.previous, prepended * BAR_WIDTH)
    previous.set(values, 0)
    this.previous = previous
    return { start: 0, count: prepended, length: bars.length, prepended, buffer: values.buffer }
  }

  /** 找首个实际变化位置；前置插入走前缀快路径，其余变化走同一尾段协议。 */
  encode(bars: readonly Bar[]): BarPatch {
    const previousLength = this.previous.length / BAR_WIDTH
    const prepended = bars.length - previousLength
    // 插入量超过已同步长度属历史替换，不是可右移表达的前置插入：按全量重发，
    // 保留接收端「prepended 大于当前序列即失同步」的断言，不放宽协议校验。
    if (
      previousLength > 0 &&
      prepended > 0 &&
      prepended <= previousLength &&
      this.isPrepend(bars, prepended)
    )
      return this.prepend(bars, prepended)

    let offset = 0
    const common = Math.min(bars.length, previousLength)
    while (offset < common && equalBar(this.previous, offset * BAR_WIDTH, bars[offset]!)) offset++
    const values = new Float64Array((bars.length - offset) * BAR_WIDTH)
    for (let index = offset; index < bars.length; index++) {
      writeBar(values, (index - offset) * BAR_WIDTH, bars[index]!)
    }
    if (this.previous.length !== bars.length * BAR_WIDTH) {
      const previous = new Float64Array(bars.length * BAR_WIDTH)
      previous.set(this.previous.subarray(0, offset * BAR_WIDTH))
      this.previous = previous
    }
    this.previous.set(values, offset * BAR_WIDTH)
    return {
      start: offset,
      count: bars.length - offset,
      length: bars.length,
      prepended: 0,
      buffer: values.buffer,
    }
  }
}

/** 接收侧原地维护内部序列；只为变化的根创建对象，不重建全部历史。 */
class BarReceiver {
  private readonly bars: Bar[] = []

  /** 按增量应用；前置插入先整体右移，再写前缀。无法应用的协议直接报错。 */
  decode(patch: BarPatch): readonly Bar[] {
    const values = new Float64Array(patch.buffer)
    if (
      patch.start + patch.count > patch.length ||
      patch.prepended > this.bars.length ||
      values.length !== patch.count * BAR_WIDTH
    ) {
      throw new RangeError('Worker 行情增量与当前序列不匹配')
    }
    if (patch.prepended > 0) {
      const previousLength = this.bars.length
      this.bars.length = previousLength + patch.prepended
      for (let index = previousLength - 1; index >= 0; index--) {
        this.bars[index + patch.prepended] = this.bars[index]!
      }
    }
    this.bars.length = patch.length
    for (let index = 0; index < patch.count; index++) {
      const target = patch.start + index
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
      // 缺字段与「为 0」必须区分：CVD 据此决定用精确口径还是估算口径。
      const buyVolume = values[offset + 7]!
      if (Number.isFinite(buyVolume)) bar.buyVolume = buyVolume
      this.bars[target] = bar
    }
    return this.bars
  }
}

/** 期权快照身份：标的、行数与首末采集时刻都相同即视为同一份数据。 */
function sameOptionLevels(
  previous: ScriptOptionLevels | null,
  next: ScriptOptionLevels | null,
): boolean {
  if (previous === null || next === null) return previous === next
  const length = next.levels.length
  if (previous.underlying !== next.underlying || previous.levels.length !== length) return false
  if (length === 0) return true
  return (
    previous.levels[0]?.capturedAt === next.levels[0]?.capturedAt &&
    previous.levels[length - 1]?.capturedAt === next.levels[length - 1]?.capturedAt
  )
}

/** 编码器归物理端口所有，不绑定脚本 ID；线程迁移天然从新端口的全量快照开始。 */
export class WorkerInputSender {
  private main = new BarSender()
  private snapshots = new Map<string, BarSender>()
  private optionLevels: ScriptOptionLevels | null = null

  /** 每次只保留本次用到的跨周期序列，不建立无界历史缓存。 */
  encode(bars: readonly Bar[], context?: ScriptRequestContext): RunInputPatch {
    const main = this.main.encode(bars)
    const next = new Map<string, BarSender>()
    const snapshots = context?.snapshots.map((snapshot) => {
      const sender = this.snapshots.get(snapshot.id) ?? new BarSender()
      next.set(snapshot.id, sender)
      return { id: snapshot.id, bars: sender.encode(snapshot.bars) }
    })
    this.snapshots = next
    if (!context || !snapshots) return { bars: main }
    // 期权快照分钟级变化，逐帧重发等于每帧复制几千行；只在身份变化时随载荷发送。
    const optionLevels = context.optionLevels ?? null
    const sendOptionLevels = !sameOptionLevels(this.optionLevels, optionLevels)
    this.optionLevels = optionLevels
    return {
      bars: main,
      context: {
        symbol: context.symbol,
        time: context.time,
        snapshots,
        ...(sendOptionLevels ? { optionLevels } : {}),
      },
    }
  }

  /** release 与端口销毁同时清掉同步基线。 */
  clear(): void {
    this.main = new BarSender()
    this.snapshots.clear()
    this.optionLevels = null
  }
}

/** 解码状态只存在于 Worker；计算错误不撤销已经同步成功的行情。 */
export class WorkerInputReceiver {
  private main = new BarReceiver()
  private snapshots = new Map<string, BarReceiver>()
  private optionLevels: ScriptOptionLevels | null = null

  /** 先同步输入再执行脚本，下一次请求不依赖上次计算是否成功。 */
  decode(input: RunInputPatch): {
    bars: readonly Bar[]
    context?: ScriptRequestContext
  } {
    const bars = this.main.decode(input.bars)
    const next = new Map<string, BarReceiver>()
    const snapshots = input.context?.snapshots.map((snapshot) => {
      const receiver = this.snapshots.get(snapshot.id) ?? new BarReceiver()
      next.set(snapshot.id, receiver)
      return { id: snapshot.id, bars: receiver.decode(snapshot.bars) }
    })
    this.snapshots = next
    const received = input.context
    if (!received || !snapshots) return { bars }
    // 载荷缺省表示沿用上次同步的快照；显式 null 表示本次没有期权数据。
    if ('optionLevels' in received) this.optionLevels = received.optionLevels ?? null
    return {
      bars,
      context: {
        symbol: received.symbol,
        ...(received.time === undefined ? {} : { time: received.time }),
        snapshots,
        ...(this.optionLevels === null ? {} : { optionLevels: this.optionLevels }),
      },
    }
  }

  /** 与发送端保持相同的显式生命周期。 */
  clear(): void {
    this.main = new BarReceiver()
    this.snapshots.clear()
    this.optionLevels = null
  }
}

/** 只传非空通信块；空块用于表达相同序列和截断，不占转移列表。 */
export function inputTransferList(input: RunInputPatch): ArrayBuffer[] {
  const buffers = [input.bars.buffer]
  for (const snapshot of input.context?.snapshots ?? []) buffers.push(snapshot.bars.buffer)
  return buffers.filter((buffer) => buffer.byteLength > 0)
}
