import { KLineChartError } from '../../errors.js'

import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry.js'

let loaded = false

export async function loadBuiltinIndicators(): Promise<void> {
  if (loaded) return
  const modules = await Promise.all([
    import('../renderers/subVolume.js'),
    import('../renderers/timeShare.js'),
    import('../renderers/fiveDayTimeShare.js'),
    import('../renderers/Indicator/atr.js'),
    import('../renderers/Indicator/boll.js'),
    import('../renderers/Indicator/cci.js'),
    import('../renderers/Indicator/chaikinVol.js'),
    import('../renderers/Indicator/cmf.js'),
    import('../renderers/Indicator/dema.js'),
    import('../renderers/Indicator/donchian.js'),
    import('../renderers/Indicator/ene.js'),
    import('../renderers/Indicator/expma.js'),
    import('../renderers/Indicator/fastk.js'),
    import('../renderers/Indicator/fib.js'),
    import('../renderers/Indicator/hma.js'),
    import('../renderers/Indicator/hv.js'),
    import('../renderers/Indicator/ichimoku.js'),
    import('../renderers/Indicator/kama.js'),
    import('../renderers/Indicator/keltner.js'),
    import('../renderers/Indicator/kst.js'),
    import('../renderers/Indicator/ma.js'),
    import('../renderers/Indicator/macd.js'),
    import('../renderers/Indicator/mfi.js'),
    import('../renderers/Indicator/mom.js'),
    import('../renderers/Indicator/obv.js'),
    import('../renderers/Indicator/parkinson.js'),
    import('../renderers/Indicator/pivot.js'),
    import('../renderers/Indicator/pvt.js'),
    import('../renderers/Indicator/roc.js'),
    import('../renderers/Indicator/rsi.js'),
    import('../renderers/Indicator/sar.js'),
    import('../renderers/Indicator/stoch.js'),
    import('../renderers/Indicator/structure.js'),
    import('../renderers/Indicator/supertrend.js'),
    import('../renderers/Indicator/tema.js'),
    import('../renderers/Indicator/trix.js'),
    import('../renderers/Indicator/vma.js'),
    import('../renderers/Indicator/volumeProfile.js'),
    import('../renderers/Indicator/vwap.js'),
    import('../renderers/Indicator/wma.js'),
    import('../renderers/Indicator/wmsr.js'),
    import('../renderers/Indicator/zones.js'),
    import('../renderers/Indicator/smma.js'),
    import('../renderers/Indicator/trima.js'),
    import('../renderers/Indicator/zlema.js'),
    import('../renderers/Indicator/vwma.js'),
    import('../renderers/Indicator/alma.js'),
    import('../renderers/Indicator/lsma.js'),
    import('../renderers/Indicator/dma.js'),
    import('../renderers/Indicator/gmma.js'),
    import('../renderers/Indicator/t3.js'),
    import('../renderers/Indicator/vidya.js'),
    import('../renderers/Indicator/frama.js'),
    import('../renderers/Indicator/dpo.js'),
    import('../renderers/Indicator/awesomeOscillator.js'),
    import('../renderers/Indicator/ultimateOscillator.js'),
    import('../renderers/Indicator/stochRSI.js'),
    import('../renderers/Indicator/fisherTransform.js'),
    import('../renderers/Indicator/schaffTrendCycle.js'),
  ])

  // 读取命名空间，确保打包器保留由装饰器初始化的指标定义导出。
  for (const module of modules) {
    if (Object.keys(module).length === 0) {
      throw new KLineChartError(
        'INVALID_STATE',
        'Builtin indicator module has no definition export.',
      )
    }
  }
  loaded = true
}

export function getBuiltinIndicatorDefinitions() {
  if (!loaded) {
    throw new KLineChartError(
      'INVALID_STATE',
      'Builtin indicators not loaded yet. Call await loadBuiltinIndicators() first.',
    )
  }
  return getRegisteredIndicatorDefinitions()
}

export function isBuiltinIndicatorsLoaded(): boolean {
  return loaded
}
