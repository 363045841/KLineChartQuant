import type { PluginHost } from '../../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../../foundation/tokens/index'
import type { KLineData } from '../../../../foundation/types/price'
import type { GetTitleInfoFn, TitleInfo } from '../../../indicators/indicatorMetadata'

interface SingleSeriesState {
  timestamp: number
  series: (number | undefined)[]
  params?: Record<string, unknown>
}

interface SingleLineTitleInfoConfig {
  createStateKey: (paneId: string) => string
  name: string
  label?: string
  defaultPeriod?: number
  getColor?: (colors: ReturnType<typeof resolveThemeColors>) => string
  color?: string
  getParams?: (stateParams: Record<string, unknown>) => number[]
}

export function createSingleLineTitleInfo(config: SingleLineTitleInfoConfig): GetTitleInfoFn {
  const { createStateKey, name, label = name, defaultPeriod, getColor, color, getParams } = config

  return (
    _data: KLineData[],
    index: number | null,
    _params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    paneId: string,
  ): TitleInfo | null => {
    if (index === null) return null

    const stateKey = createStateKey(paneId)
    const state = pluginHost.getSharedState<SingleSeriesState>(stateKey)
    if (!state) return null

    const val = state.series[index]
    if (val === undefined) return null

    const resolvedColor = color ?? (getColor ? getColor(resolveThemeColors('light')) : 'inherit')
    const resolvedParams = getParams
      ? getParams(state.params as Record<string, unknown>)
      : defaultPeriod !== undefined
        ? [(_params.period as number) ?? defaultPeriod]
        : []

    return {
      name,
      params: resolvedParams,
      values: [{ label, value: val, color: resolvedColor }],
    }
  }
}
