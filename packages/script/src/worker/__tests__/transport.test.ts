/** 通信契约验收：真实转移、原地 tick、历史重排、跨周期释放和真实脚本绘图往返。 */
import type { Bar, PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { createScriptWorker } from '../impl/createScriptWorker.js'
import {
  inputTransferList,
  WorkerInputReceiver,
  WorkerInputSender,
} from '../transport/impl/input.js'
import { packPlotCollection, unpackPlotCollection } from '../transport/impl/output.js'
import { NodeScriptWorker } from './nodeWorker.js'

/** 不替换计算或传输实现；只构造各边界情况所需的输入根。 */
function bar(time: number, close = 10): Bar {
  return { time, open: 10, high: Math.max(10, close), low: Math.min(10, close), close, volume: 2 }
}

describe('Worker input synchronization', () => {
  it('transfers only changed tails and preserves the caller data', () => {
    const sender = new WorkerInputSender()
    const receiver = new WorkerInputReceiver()
    const bars = [bar(1), bar(2)]
    const full = sender.encode(bars)
    const transferred = structuredClone(full, { transfer: inputTransferList(full) })
    expect(full.bars.buffer.byteLength).toBe(0)
    expect(receiver.decode(transferred).bars).toStrictEqual(bars)
    const unchanged = sender.encode(bars)
    expect(unchanged.bars.buffer.byteLength).toBe(0)
    bars[1]!.close = 11
    bars[1]!.closed = false
    const tick = sender.encode(bars)
    expect(tick.bars.start).toBe(1)
    expect(tick.bars.buffer.byteLength).toBe(7 * Float64Array.BYTES_PER_ELEMENT)
    expect(receiver.decode(tick).bars).toStrictEqual(bars)
    bars.push({ ...bar(3), closed: undefined })
    const append = sender.encode(bars)
    expect(append.bars.start).toBe(2)
    expect(receiver.decode(append).bars).toStrictEqual(bars)
    // 前置插入只发送新增前缀，不重发整段历史。
    const prependedBars = [{ ...bar(0) }, ...bars]
    const prepend = sender.encode(prependedBars)
    expect(prepend.bars.prepended).toBe(1)
    expect(prepend.bars.count).toBe(1)
    expect(prepend.bars.buffer.byteLength).toBe(7 * Float64Array.BYTES_PER_ELEMENT)
    expect(receiver.decode(prepend).bars).toStrictEqual(prependedBars)
  })

  it('handles history corrections, prepend, truncation, empty data and reset', () => {
    const sender = new WorkerInputSender()
    const receiver = new WorkerInputReceiver()
    for (const bars of [
      [bar(2), bar(3)],
      [bar(2, 9), bar(3)],
      [bar(1), bar(2, 9), bar(3)],
      [bar(1)],
      [],
      [bar(7, 20)],
    ])
      expect(receiver.decode(sender.encode(bars)).bars).toStrictEqual(bars)
    sender.clear()
    receiver.clear()
    const reset = sender.encode([bar(7, 20)])
    expect(reset.bars.start).toBe(0)
    expect(receiver.decode(reset).bars).toStrictEqual([bar(7, 20)])
  })

  it('prunes low-timeframe baselines and isolates physical workers', () => {
    const sender = new WorkerInputSender()
    const receiver = new WorkerInputReceiver()
    const context = { symbol: 'BTCUSDT', snapshots: [{ id: 'minute', bars: [bar(1), bar(2)] }] }
    expect(receiver.decode(sender.encode([bar(1)], context)).context).toStrictEqual(context)
    expect(sender.encode([bar(1)], context).context?.snapshots[0]?.bars.buffer.byteLength).toBe(0)
    receiver.decode(sender.encode([bar(1)]))
    const restored = sender.encode([bar(1)], context)
    expect(restored.context?.snapshots[0]?.bars.start).toBe(0)
    expect(receiver.decode(restored).context).toStrictEqual(context)
    const other = new WorkerInputSender().encode([bar(1)], context)
    expect(other.bars.start).toBe(0)
    expect(new WorkerInputReceiver().decode(other).context).toStrictEqual(context)
  })
})

describe('Worker drawing transport', () => {
  it('roundtrips real script scalar, OHLC, fills, boxes, labels and lines', () => {
    const script = prepareNativeScript(`defineIndicator({name:'Wire',position:Position.Main,onBar(){
      const a=plot.Line(close,'a');const b=plot.Line(close[0]+1,'b');
      fill(a,b,Color.Red);plot.Candle(open,high,low,close,'ohlc');
      box.new({left:bar_index,right:bar_index+1,top:high[0],bottom:low[0]});
      label.new({x:bar_index,y:close[0],text:'价格'});
      line.new(bar_index,low[0],bar_index+1,high[0]);
    }})`)
    const original = script.run([bar(1), bar(2, 12)])
    const snapshot = structuredClone(original)
    const packed = packPlotCollection(original)
    const received = structuredClone(packed, { transfer: [packed.buffer] })
    expect(packed.buffer.byteLength).toBe(0)
    expect(unpackPlotCollection(received)).toStrictEqual(snapshot)
    expect(original).toStrictEqual(snapshot)
  })

  it('preserves gaps, NaN, optional fields and independent drawing styles', () => {
    const collection: PlotCollection = {
      plots: [
        {
          kind: 'line',
          id: 'line',
          label: 'line',
          color: 'inherit',
          visible: true,
          offset: -1,
          size: 'auto',
          dash: [],
          data: [undefined, { value: NaN }, { value: -0, color: undefined, textColor: 'inherit' }],
        },
      ],
      fills: [
        { id: 'fill', from: 'line', to: 'line', visible: true, colors: [null, 'inherit', null] },
      ],
      drawings: Array.from({ length: 100 }, (_, index) => ({
        id: String(index),
        kind: 'rectangle',
        paneId: 'main',
        visible: true,
        zIndex: index,
        style: { stroke: 'inherit', fill: 'inherit' },
        params: {},
        anchors: [
          { id: 'a', price: 2, time: '2026-11-06', futureOffset: undefined },
          { id: 'b', type: 'point', time: 3, logicalIndex: 1, price: 4 },
        ],
      })),
    }
    const packed = packPlotCollection(collection)
    expect(packed.drawings?.metadata).toHaveLength(1)
    const result = unpackPlotCollection(packed)
    expect(result).toStrictEqual(collection)
    result.drawings![0]!.style.stroke = 'currentColor'
    expect(result.drawings![1]!.style.stroke).toBe('inherit')
    expect(collection.drawings![0]!.style.stroke).toBe('inherit')
  })
})

it('keeps port-owned baselines correct across real thread calculations and failures', async () => {
  const transfers: number[][] = []
  const detached: boolean[] = []
  class TransferWorker extends NodeScriptWorker {
    /** 记录实际发出的字节数与转移后的所有权状态。 */
    override postMessage(message: unknown, transfer: readonly ArrayBuffer[] = []): void {
      if (transfer.length) transfers.push(transfer.map((buffer) => buffer.byteLength))
      super.postMessage(message, transfer)
      if (transfer.length) detached.push(transfer.every((buffer) => buffer.byteLength === 0))
    }
  }
  vi.stubGlobal('Worker', TransferWorker)
  const worker = createScriptWorker()
  const bars: Bar[] = Array.from({ length: 1500 }, (_, index) => ({
    time: index * 60000,
    open: index,
    high: index + 1,
    low: index - 1,
    close: index,
    volume: 1,
    closed: true,
  }))
  const source = `defineIndicator({name:'WireLifecycle',position:Position.Main,onBar(){
    if(close[0]<0) throw new Error('invalid-price');plot.Line(close,'close');
  }})`
  try {
    await worker.prepare('wire', source, [], true)
    expect((await worker.run('wire', bars)).plots[0]?.data.at(-1)).toEqual({ value: 1499 })
    const fullBytes = transfers.at(-1)![0]!
    expect(fullBytes).toBeGreaterThan(0)
    bars[1499]!.close = 1500
    expect((await worker.run('wire', bars)).plots[0]?.data.at(-1)).toEqual({ value: 1500 })
    // 后续 tick 只同步变化尾部，不再重发整段历史。
    expect(transfers.at(-1)![0]).toBeLessThan(fullBytes)
    bars[1499]!.close = -1
    await expect(worker.run('wire', bars)).rejects.toThrow('invalid-price')
    bars[1499]!.close = 1501
    expect((await worker.run('wire', bars)).plots[0]?.data.at(-1)).toEqual({ value: 1501 })
    expect(transfers.at(-1)![0]).toBeLessThan(fullBytes)
    await worker.release('wire')
    await worker.prepare('wire', source, [], true)
    const context = { symbol: 'BTCUSDT', snapshots: [{ id: 'lower', bars }] }
    await worker.run('wire', bars, {}, context)
    expect(transfers.at(-1)).toHaveLength(2)
    const before = transfers.length
    await worker.run('wire', bars, {}, context)
    expect(transfers).toHaveLength(before)
    expect(detached.every(Boolean)).toBe(true)
    expect(bars[1499]!.close).toBe(1501)
  } finally {
    worker.dispose()
    vi.unstubAllGlobals()
  }
}, 15_000)
