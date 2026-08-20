import type { IndicatorRenderStateReader } from '../../../../foundation/plugin/index'
import type { ColorTokens } from '../../../../foundation/tokens/index'
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
  getColor?: (colors: ColorTokens) => string
  color?: string
  getParams?: (stateParams: Record<string, unknown>) => number[]
}

export function createSingleLineTitleInfo(config: SingleLineTitleInfoConfig): GetTitleInfoFn {
  const { createStateKey, name, label = name, defaultPeriod, getColor, color, getParams } = config

  return (
    _data: KLineData[],
    index: number | null,
    _params: Record<string, number | boolean | string>,
    stateReader: IndicatorRenderStateReader,
    paneId: string,
    colors: ColorTokens,
  ): TitleInfo | null => {
    if (index === null) return null

    const stateKey = createStateKey(paneId)
    const state = stateReader.get<SingleSeriesState>(stateKey)
    if (!state) return null

    const val = state.series[index]
    if (val === undefined) return null

    const resolvedColor = color ?? (getColor ? getColor(colors) : 'inherit')
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
