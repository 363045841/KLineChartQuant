/** 真实 Worker 验证：警报事件随计算结果返回，历史运行不产生事件。 */
import { afterEach, expect, it, vi } from 'vitest'
import { createNodeScriptWorker } from './helpers/nodeScriptWorker.js'

afterEach(() => vi.unstubAllGlobals())

it('returns live alerts from the worker and keeps history silent', async () => {
  const worker = createNodeScriptWorker()
  try {
    const source =
      "defineAlert({ version: 2, name: 'WorkerAlert', frequency: 'all', onBar() { if (close[0] >= 10) alert('hit ' + close[0]) } })"
    await worker.prepare('alert', source, [], true)
    const bars = [
      { time: 1, open: 9, high: 9, low: 9, close: 9, volume: 1 },
      { time: 2, open: 10, high: 10, low: 10, close: 10, volume: 1 },
    ]
    const history = await worker.run('alert', {
      bars,
      change: { kind: 'reset', start: 0, revision: 0 },
      params: {},
      live: false,
    })
    expect(history.alerts).toEqual([])
    expect(history.series.plots).toHaveLength(0)

    const live = await worker.run('alert', {
      bars,
      change: { kind: 'update', start: 1, revision: 1 },
      params: {},
      live: true,
    })
    expect(live.alerts).toHaveLength(1)
    expect(live.alerts[0]).toEqual({
      message: 'hit 10',
      barTime: 2,
      price: 10,
    })
  } finally {
    worker.dispose()
  }
})

