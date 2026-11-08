/** 真实 Worker 验证：目录元数据不安装计算会话，首次执行可恢复，重新准备仍保持输出正确。 */
import { afterEach, expect, it, vi } from 'vitest'
import { createScriptWorker } from '../impl/createScriptWorker.js'
import { NodeScriptWorker } from './nodeWorker.js'

afterEach(() => vi.unstubAllGlobals())

it('keeps metadata-only scripts executable without retaining their temporary sessions', async () => {
  const modes: boolean[] = []
  class ObservedWorker extends NodeScriptWorker {
    override postMessage(message: unknown, transfer: readonly ArrayBuffer[] = []): void {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'prepare'
      ) {
        modes.push('metadataOnly' in message && message.metadataOnly === true)
      }
      super.postMessage(message, transfer)
    }
  }
  vi.stubGlobal('Worker', ObservedWorker)
  const worker = createScriptWorker()
  try {
    const source =
      'defineIndicator({name:"MetadataOnly",position:Position.Main,onBar(){plot.Line(close,"close")}})'
    expect((await worker.prepare('meta', source, [], true, 'metadata')).name).toBe('MetadataOnly')
    expect(modes).toEqual([true])
    const bars = [{ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 2 }]
    expect((await worker.run('meta', bars)).plots[0]?.data[0]).toEqual({ value: 11 })
    expect(modes).toEqual([true, false])
    await worker.run('meta', bars)
    expect(modes).toEqual([true, false])
    await worker.release('meta')
  } finally {
    worker.dispose()
  }
}, 15000)
