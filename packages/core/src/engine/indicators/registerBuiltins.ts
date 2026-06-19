import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry'

let loaded = false

export async function loadBuiltinIndicators(): Promise<void> {
  if (loaded) return
  await Promise.all([
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
  ])
  loaded = true
}

export function getBuiltinIndicatorDefinitions() {
  if (!loaded) {
    throw new Error(
      'Builtin indicators not loaded yet. Call await loadBuiltinIndicators() first.',
    )
  }
  return getRegisteredIndicatorDefinitions()
}

export function isBuiltinIndicatorsLoaded(): boolean {
  return loaded
}
