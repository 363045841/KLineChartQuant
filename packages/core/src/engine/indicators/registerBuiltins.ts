import { KLineChartError } from '../../errors'

import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry'

let loaded = false

export async function loadBuiltinIndicators(): Promise<void> {
  if (loaded) return
  const modules = await Promise.all([
    import('../renderers/subVolume'),
    import('../renderers/timeShare'),
    import('../renderers/Indicator/atr'),
    import('../renderers/Indicator/boll'),
    import('../renderers/Indicator/cci'),
    import('../renderers/Indicator/chaikinVol'),
    import('../renderers/Indicator/cmf'),
    import('../renderers/Indicator/dema'),
    import('../renderers/Indicator/donchian'),
    import('../renderers/Indicator/ene'),
    import('../renderers/Indicator/expma'),
    import('../renderers/Indicator/fastk'),
    import('../renderers/Indicator/fib'),
    import('../renderers/Indicator/hma'),
    import('../renderers/Indicator/hv'),
    import('../renderers/Indicator/ichimoku'),
    import('../renderers/Indicator/kama'),
    import('../renderers/Indicator/keltner'),
    import('../renderers/Indicator/kst'),
    import('../renderers/Indicator/ma'),
    import('../renderers/Indicator/macd'),
    import('../renderers/Indicator/mfi'),
    import('../renderers/Indicator/mom'),
    import('../renderers/Indicator/obv'),
    import('../renderers/Indicator/parkinson'),
    import('../renderers/Indicator/pivot'),
    import('../renderers/Indicator/pvt'),
    import('../renderers/Indicator/roc'),
    import('../renderers/Indicator/rsi'),
    import('../renderers/Indicator/sar'),
    import('../renderers/Indicator/stoch'),
    import('../renderers/Indicator/structure'),
    import('../renderers/Indicator/supertrend'),
    import('../renderers/Indicator/tema'),
    import('../renderers/Indicator/trix'),
    import('../renderers/Indicator/vma'),
    import('../renderers/Indicator/volumeProfile'),
    import('../renderers/Indicator/vwap'),
    import('../renderers/Indicator/wma'),
    import('../renderers/Indicator/wmsr'),
    import('../renderers/Indicator/zones'),
    import('../renderers/Indicator/smma'),
    import('../renderers/Indicator/trima'),
    import('../renderers/Indicator/zlema'),
    import('../renderers/Indicator/vwma'),
    import('../renderers/Indicator/alma'),
    import('../renderers/Indicator/lsma'),
    import('../renderers/Indicator/dma'),
    import('../renderers/Indicator/gmma'),
    import('../renderers/Indicator/t3'),
    import('../renderers/Indicator/vidya'),
    import('../renderers/Indicator/frama'),
    import('../renderers/Indicator/dpo'),
    import('../renderers/Indicator/awesomeOscillator'),
    import('../renderers/Indicator/ultimateOscillator'),
    import('../renderers/Indicator/stochRSI'),
    import('../renderers/Indicator/fisherTransform'),
    import('../renderers/Indicator/schaffTrendCycle'),
  ])

  // 读取命名空间，确保打包器保留由装饰器初始化的指标定义导出。
  for (const module of modules) {
    if (Object.keys(module).length === 0) {
      throw new KLineChartError('INVALID_STATE', 'Builtin indicator module has no definition export.')
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
