/** 期权取数接线：宿主按品种映射取数，结果经 Worker 载荷进入脚本。 */
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core'
import { DEFAULT_OPTION_HISTORY_ROWS } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import { optionRow } from '../../../../script/src/__tests__/marketData.js'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

/** 只读最近一条快照的现货指数；没有数据时留空。 */
const SOURCE = `defineIndicator({name:'OptionWire',position:Position.Main,onBar(){
  const latest = option.levels()
  plot.Line(latest === null ? null : latest.spotIndex, 'spot')
}})`

/** 一根日线；期权取值只依赖载荷，不依赖 K 线时间。 */
const BARS = [
  { timestamp: 1, open: 10, high: 11, low: 9, close: 10, volume: 1 },
  { timestamp: 2, open: 10, high: 11, low: 9, close: 10, volume: 1 },
]

describe('期权取数接线', () => {
  it('按映射取数进入脚本；映射消失后同一实例画空', async () => {
    vi.stubGlobal('Worker', NodeScriptWorker)
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [SOURCE],
    })
    const runtime = getRegisteredIndicatorDefinition('OptionWire')?.runtime
    if (!runtime) throw new Error('OptionWire not registered')
    const loadOptionLevels = vi.fn(async () => [
      optionRow(1_000, { spotIndex: 69000 }),
      optionRow(2_000, { spotIndex: 69500 }),
    ])
    try {
      const mapped = await runtime.compute(BARS, {}, {
        symbol: 'BTCUSDT.P',
        optionUnderlying: 'BTC',
        loadBars: async () => {
          throw new Error('本用例不请求跨周期行情')
        },
        loadOptionLevels,
      })
      expect(loadOptionLevels).toHaveBeenCalledWith(
        { underlying: 'BTC', historyLimit: DEFAULT_OPTION_HISTORY_ROWS },
        undefined,
      )
      expect(mapped).toMatchObject({
        plots: [{ id: 'spot', data: [{ value: 69500 }, { value: 69500 }] }],
      })

      // 换到没有映射的品种：不再取数，同一运行实例上的线必须清空而不是留着上一只标的。
      const unmapped = await runtime.compute(BARS, {}, {
        symbol: 'AAPL',
        optionUnderlying: null,
        loadBars: async () => {
          throw new Error('本用例不请求跨周期行情')
        },
        loadOptionLevels,
      })
      expect(loadOptionLevels).toHaveBeenCalledTimes(1)
      expect(unmapped).toMatchObject({ plots: [{ id: 'spot', data: [undefined, undefined] }] })
    } finally {
      service.dispose()
      vi.unstubAllGlobals()
    }
  }, 15_000)
})
