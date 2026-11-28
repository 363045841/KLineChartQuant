/** 通信契约验收：显式变化编码、增量往返、历史替换与真实线程生命周期。 */
import type { Bar, IndicatorSeries } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import { prepareNative } from '../../__tests__/backends.js'
import { createNodeScriptWorker } from './helpers/nodeScriptWorker.js'
import { encodeRunInput, inputTransferList, WorkerInputReceiver } from '../transport/impl/input.js'
import { packIndicatorSeries, unpackIndicatorSeries } from '../transport/impl/series.js'
import { NodeScriptWorker } from './nodeWorker.js'

/** 不替换计算或传输实现；只构造各边界情况所需的输入根。 */
function bar(time: number, close = 10): Bar {
  return { time, open: 10, high: Math.max(10, close), low: Math.min(10, close), close, volume: 2 }
}

/** 把发送帧按结构化克隆的语义转移一次。 */
function transfer(input: ReturnType<typeof encodeRunInput>) {
  return structuredClone(input, { transfer: inputTransferList(input) })
}

describe('Worker input synchronization', () => {
  it('sends the whole series on reset and only the changed tail on append', () => {
    const receiver = new WorkerInputReceiver()
    const bars = [bar(1), bar(2)]
    const full = encodeRunInput(
      { bars, change: { kind: 'reset', start: 0, revision: 0 } },
      false,
    )
    expect(full.bars.buffer.byteLength).toBe(2 * 7 * Float64Array.BYTES_PER_ELEMENT)
    expect(receiver.decode(transfer(full)).bars).toStrictEqual(bars)

    const appended = [...bars, bar(3)]
    const append = encodeRunInput(
      { bars: appended, change: { kind: 'append', start: 2, revision: 1 } },
      false,
    )
    expect(append.bars.change.start).toBe(2)
    expect(append.bars.buffer.byteLength).toBe(7 * Float64Array.BYTES_PER_ELEMENT)
    expect(receiver.decode(transfer(append)).bars).toStrictEqual(appended)
  })

  it('sends a single bar on update and keeps the receiver snapshot independent', () => {
    const receiver = new WorkerInputReceiver()
    const bars = [bar(1), bar(2)]
    receiver.decode(
      transfer(encodeRunInput({ bars, change: { kind: 'reset', start: 0, revision: 0 } }, false)),
    )
    const changed = [bars[0]!, bar(2, 11)]
    const update = encodeRunInput(
      { bars: changed, change: { kind: 'update', start: 1, revision: 1 } },
      false,
    )
    expect(update.bars.buffer.byteLength).toBe(7 * Float64Array.BYTES_PER_ELEMENT)
    const decoded = receiver.decode(transfer(update)).bars
    expect(decoded).toStrictEqual(changed)
    // 调用方之后修改自己的数组，不应影响已解码的副本。
    changed[1]!.close = 99
    expect(decoded[1]!.close).toBe(11)
  })

  it('sends the suffix on replace and the full series on reset', () => {
    const receiver = new WorkerInputReceiver()
    const bars = [bar(1), bar(2), bar(3)]
    receiver.decode(
      transfer(encodeRunInput({ bars, change: { kind: 'reset', start: 0, revision: 0 } }, false)),
    )
    const replaced = [bar(1, 20), bar(2, 21), bar(3, 22)]
    const patch = encodeRunInput(
      { bars: replaced, change: { kind: 'replace', start: 0, revision: 1 } },
      false,
    )
    expect(patch.bars.buffer.byteLength).toBe(3 * 7 * Float64Array.BYTES_PER_ELEMENT)
    expect(receiver.decode(transfer(patch)).bars).toStrictEqual(replaced)
  })

  it('encodes each request snapshot with its own change', () => {
    const receiver = new WorkerInputReceiver()
    const context = {
      symbol: 'BTCUSDT',
      snapshots: [
        { id: 'minute', bars: [bar(1)], change: { kind: 'reset' as const, start: 0, revision: 0 } },
      ],
    }
    const first = encodeRunInput(
      { bars: [bar(1)], change: { kind: 'reset', start: 0, revision: 0 }, context },
      false,
    )
    expect(receiver.decode(transfer(first)).context).toStrictEqual(context)

    const nextContext = {
      ...context,
      snapshots: [
        { id: 'minute', bars: [bar(1), bar(2)], change: { kind: 'append' as const, start: 1, revision: 1 } },
      ],
    }
    const next = encodeRunInput(
      { bars: [bar(1)], change: { kind: 'update', start: 0, revision: 1 }, context: nextContext },
      false,
    )
    expect(next.context?.snapshots[0]?.bars.buffer.byteLength).toBe(
      7 * Float64Array.BYTES_PER_ELEMENT,
    )
    expect(receiver.decode(transfer(next)).context?.snapshots[0]?.bars).toStrictEqual([
      bar(1),
      bar(2),
    ])
  })
})

describe('Worker drawing transport', () => {
  it('patches only the tail and preserves the untouched prefix', () => {
    const plot = {
      kind: 'line' as const,
      id: 'line',
      label: 'line',
      visible: true,
      offset: 0,
      size: 'auto' as const,
      dash: [] as number[],
      data: [
        { value: 1, color: 'inherit' },
        { value: 2, color: 'inherit' },
        { value: 3, color: 'inherit' },
      ],
    }
    const series: IndicatorSeries = { plots: [plot], fills: [] }
    const previous = unpackIndicatorSeries(packIndicatorSeries(series))
    const next: IndicatorSeries = {
      ...series,
      plots: [
        {
          ...plot,
          data: [plot.data[0], { value: 20, color: 'inherit' }, { value: 30, color: 'inherit' }],
        },
      ],
    }
    const patch = packIndicatorSeries(next, 1)
    expect(patch.buffer.byteLength).toBeLessThan(packIndicatorSeries(next).buffer.byteLength)
    const patched = unpackIndicatorSeries(patch, previous)
    const prior = previous.plots[0]!
    const result = patched.plots[0]!
    if (result.kind !== 'line' || prior.kind !== 'line') throw new TypeError('expected line')
    expect(result.data[0]).toBe(prior.data[0])
    expect(result.data[1]).toMatchObject({ value: 20 })
    expect(result.data[2]).toMatchObject({ value: 30 })
  })

  it('roundtrips real script scalar, OHLC, fills, boxes, labels and lines', () => {
    const script = prepareNative(`defineIndicator({ version: 2,name:'Wire',position:Position.main,onBar(){
      const a=plot.Line(close,'a');const b=plot.Line(close[0]+1,'b');
      fill(a,b,Color.red);plot.Candle(open,high,low,close,'ohlc');
      box.new({left:barIndex,right:barIndex+1,top:high[0],bottom:low[0]});
      label.new({x:barIndex,y:close[0],text:'价格'});
      line.new(barIndex,low[0],barIndex+1,high[0]);
    }})`)
    const original = script.run([bar(1), bar(2, 12)])
    const snapshot = structuredClone(original)
    const packed = packIndicatorSeries(original)
    const received = structuredClone(packed, { transfer: [packed.buffer] })
    expect(packed.buffer.byteLength).toBe(0)
    expect(unpackIndicatorSeries(received)).toStrictEqual(snapshot)
    expect(original).toStrictEqual(snapshot)
  })

  it('preserves gaps, NaN, optional fields and independent drawing styles', () => {
    const series: IndicatorSeries = {
      plots: [
        {
          kind: 'line',
          id: 'line',
          label: 'line',
          visible: true,
          offset: -1,
          size: 'auto',
          dash: [],
          data: [
            undefined,
            { value: NaN, color: 'inherit' },
            { value: -0, color: 'inherit', textColor: 'inherit' },
          ],
        },
      ],
      fills: [
        { id: 'fill', from: 'line', to: 'line', visible: true, colors: [null, 'inherit', null] },
      ],
      drawings: Array.from({ length: 2 }, (_, index) => ({
        id: String(index),
        kind: 'rectangle',
        paneId: 'main',
        visible: true,
        zIndex: index,
        style: { stroke: 'inherit', fill: 'inherit' },
        params: {},
        anchors: [
          { id: 'a', price: 2, time: '2026-11-06' },
          { id: 'b', type: 'point', time: 3, logicalIndex: 1, price: 4 },
        ],
      })),
    }
    const packed = packIndicatorSeries(series)
    expect(packed.drawings?.metadata).toHaveLength(1)
    const result = unpackIndicatorSeries(packed)
    expect(result).toStrictEqual(series)
    result.drawings![0]!.style.stroke = 'currentColor'
    expect(result.drawings![1]!.style.stroke).toBe('inherit')
    expect(series.drawings![0]!.style.stroke).toBe('inherit')
  })
})

it('keeps revision continuity across real thread calculations and failures', async () => {
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
  const worker = createNodeScriptWorker({ thread: () => new TransferWorker() })
  const bars: Bar[] = Array.from({ length: 1500 }, (_, index) => ({
    time: index * 60000,
    open: index,
    high: index + 1,
    low: index - 1,
    close: index,
    volume: 1,
    closed: true,
  }))
  const source = `defineIndicator({ version: 2,name:'WireLifecycle',position:Position.main,onBar(){
    if(close[0]<0) throw new Error('invalid-price');plot.Line(close,'close');
  }})`
  try {
    await worker.prepare('wire', source, [], true)
    expect(
      (
        await worker.run('wire', {
          bars,
          change: { kind: 'reset', start: 0, revision: 0 },
        })
      ).series.plots[0]?.data.at(-1),
    ).toEqual({ value: 1499, color: '@blue' })
    const fullBytes = transfers.at(-1)![0]!
    expect(fullBytes).toBeGreaterThan(0)

    bars[1499]!.close = 1500
    expect(
      (
        await worker.run('wire', {
          bars,
          change: { kind: 'update', start: 1499, revision: 1 },
        })
      ).series.plots[0]?.data.at(-1),
    ).toEqual({ value: 1500, color: '@blue' })
    expect(transfers.at(-1)![0]).toBeLessThan(fullBytes)

    bars[1499]!.close = -1
    await expect(
      worker.run('wire', { bars, change: { kind: 'update', start: 1499, revision: 2 } }),
    ).rejects.toThrow('invalid-price')
    bars[1499]!.close = 1501
    expect(
      (
        await worker.run('wire', {
          bars,
          change: { kind: 'update', start: 1499, revision: 3 },
        })
      ).series.plots[0]?.data.at(-1),
    ).toEqual({ value: 1501, color: '@blue' })
    expect(transfers.at(-1)![0]).toBeLessThan(fullBytes)

    // 修订号断层：端口自动改发全量。
    await worker.run('wire', {
      bars,
      change: { kind: 'update', start: 1499, revision: 99 },
    })
    expect(transfers.at(-1)![0]).toBe(fullBytes)

    await worker.release('wire')
    await worker.prepare('wire', source, [], true)
    const context = {
      symbol: 'BTCUSDT',
      snapshots: [
        { id: 'lower', bars, change: { kind: 'reset' as const, start: 0, revision: 0 } },
      ],
    }
    await worker.run('wire', {
      bars,
      change: { kind: 'reset', start: 0, revision: 0 },
      context,
    })
    expect(transfers.at(-1)).toHaveLength(2)
    expect(detached.every(Boolean)).toBe(true)
    expect(bars[1499]!.close).toBe(1501)
  } finally {
    worker.dispose()
    vi.unstubAllGlobals()
  }
})
