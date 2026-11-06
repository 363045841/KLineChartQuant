/** 使用真实线程验收增量端口：转移生效、计算失败后的同步与 release 后重新同步。 */
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import { expect, it, vi } from 'vitest'
import { createScriptWorker } from '../impl/createScriptWorker.js'
import { NodeScriptWorker } from './nodeWorker.js'

it('keeps port-owned baselines correct across real thread calculations and failures', async () => {
  const transfers: number[][] = []
  const detached: boolean[] = []
  class TransferWorker extends NodeScriptWorker {
    constructor(url?: URL) {
      super(url)
    }
    /** 在实际发送前记录字节数，发送后检查所有权已经转移。 */
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
    expect(transfers.at(-1)).toEqual([1500 * 56])
    bars[1499]!.close = 1500
    expect((await worker.run('wire', bars)).plots[0]?.data.at(-1)).toEqual({ value: 1500 })
    expect(transfers.at(-1)).toEqual([56])
    bars[1499]!.close = -1
    await expect(worker.run('wire', bars)).rejects.toThrow('invalid-price')
    bars[1499]!.close = 1501
    expect((await worker.run('wire', bars)).plots[0]?.data.at(-1)).toEqual({ value: 1501 })
    expect(transfers.at(-1)).toEqual([56])
    await worker.release('wire')
    await worker.prepare('wire', source, [], true)
    const context = { symbol: 'BTCUSDT', snapshots: [{ id: 'lower', bars }] }
    await worker.run('wire', bars, {}, context)
    expect(transfers.at(-1)).toEqual([1500 * 56, 1500 * 56])
    const before = transfers.length
    await worker.run('wire', bars, {}, context)
    expect(transfers).toHaveLength(before)
    expect(detached.every(Boolean)).toBe(true)
    expect(bars[1499]!.close).toBe(1501)
  } finally {
    worker.dispose()
    vi.unstubAllGlobals()
  }
}, 15000)
