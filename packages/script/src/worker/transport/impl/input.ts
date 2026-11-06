/** 每个物理 Worker 一份当前输入：按数值比较行情，传输变化尾段，退出数据集立即释放旧快照。 */
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
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

/** 用独立数值快照比较，调用方原地改末根也不会被引用相等漏掉。 */
function equalBar(previous: Float64Array, offset: number, bar: Bar): boolean {
  return (
    Object.is(previous[offset], bar.time) &&
    Object.is(previous[offset + 1], bar.open) &&
    Object.is(previous[offset + 2], bar.high) &&
    Object.is(previous[offset + 3], bar.low) &&
    Object.is(previous[offset + 4], bar.close) &&
    Object.is(previous[offset + 5], bar.volume) &&
    previous[offset + 6] === closedValue(bar)
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
}

/** 单条序列只保存最近一次输入；扫描比较不创建对象，只为变化尾段分配通信内存。 */
class BarSender {
  private previous = new Float64Array(0)

  /** 找首个实际变化位置；补历史、历史修正和截断走同一协议。 */
  encode(bars: readonly Bar[]): BarPatch {
    let offset = 0
    const common = Math.min(bars.length, this.previous.length / BAR_WIDTH)
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
    return { offset, length: bars.length, buffer: values.buffer }
  }
}

/** 接收侧原地维护内部序列；只为变化的根创建对象，不重建全部历史。 */
class BarReceiver {
  private readonly bars: Bar[] = []

  /** 按发送顺序应用尾段；无法应用的协议直接报错，禁止悄悄使用旧行情。 */
  decode(patch: BarPatch): readonly Bar[] {
    const values = new Float64Array(patch.buffer)
    if (
      patch.offset > this.bars.length ||
      patch.offset > patch.length ||
      values.length !== (patch.length - patch.offset) * BAR_WIDTH
    ) {
      throw new RangeError('Worker 行情增量与当前序列不匹配')
    }
    this.bars.length = patch.length
    for (let index = patch.offset; index < patch.length; index++) {
      const offset = (index - patch.offset) * BAR_WIDTH
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
      this.bars[index] = bar
    }
    return this.bars
  }
}

/** 编码器归物理端口所有，不绑定脚本 ID；线程迁移天然从新端口的全量快照开始。 */
export class WorkerInputSender {
  private main = new BarSender()
  private snapshots = new Map<string, BarSender>()

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
    return { bars: main, context: { ...context, snapshots } }
  }

  /** release 与端口销毁同时清掉同步基线。 */
  clear(): void {
    this.main = new BarSender()
    this.snapshots.clear()
  }
}

/** 解码状态只存在于 Worker；计算错误不撤销已经同步成功的行情。 */
export class WorkerInputReceiver {
  private main = new BarReceiver()
  private snapshots = new Map<string, BarReceiver>()

  /** 先同步输入再执行脚本，下一次请求不依赖上次计算是否成功。 */
  decode(input: RunInputPatch): { bars: readonly Bar[]; context?: ScriptRequestContext } {
    const bars = this.main.decode(input.bars)
    const next = new Map<string, BarReceiver>()
    const snapshots = input.context?.snapshots.map((snapshot) => {
      const receiver = this.snapshots.get(snapshot.id) ?? new BarReceiver()
      next.set(snapshot.id, receiver)
      return { id: snapshot.id, bars: receiver.decode(snapshot.bars) }
    })
    this.snapshots = next
    if (!input.context || !snapshots) return { bars }
    return { bars, context: { ...input.context, snapshots } }
  }

  /** 与发送端保持相同的显式生命周期。 */
  clear(): void {
    this.main = new BarReceiver()
    this.snapshots.clear()
  }
}

/** 只传非空通信块；空块用于表达相同序列和截断，不占转移列表。 */
export function inputTransferList(input: RunInputPatch): ArrayBuffer[] {
  const buffers = [input.bars.buffer]
  for (const snapshot of input.context?.snapshots ?? []) buffers.push(snapshot.bars.buffer)
  return buffers.filter((buffer) => buffer.byteLength > 0)
}
