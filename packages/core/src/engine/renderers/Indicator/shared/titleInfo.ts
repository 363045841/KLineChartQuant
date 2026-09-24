import type { GetTitleInfoFn, TitleInfo } from '@/engine/indicators/indicatorMetadata.js'
import type { IndicatorRenderStateReader } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'

interface SingleSeriesState {
  timestamp: number
  series: (number | undefined)[]
  params?: Record<string, unknown>
}

interface SingleLineTitleInfoConfig {
  name: string
  label?: string
  defaultPeriod?: number
  getColor?: (colors: ColorTokens) => string
  color?: string
  getParams?: (stateParams: Record<string, unknown>) => number[]
}

/** 构造单线指标标题；状态按调用方提供的实例 ID 读取。 */
export function createSingleLineTitleInfo(config: SingleLineTitleInfoConfig): GetTitleInfoFn {
  const { name, label = name, defaultPeriod, getColor, color, getParams } = config

  return (
    _data: KLineData[],
    index: number | null,
    _params: Record<string, number | boolean | string>,
    stateReader: IndicatorRenderStateReader,
    instanceId: string,
    _paneId: string,
    colors: ColorTokens,
  ): TitleInfo | null => {
    if (index === null) return null

    const state = stateReader.get<SingleSeriesState>(instanceId)
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
