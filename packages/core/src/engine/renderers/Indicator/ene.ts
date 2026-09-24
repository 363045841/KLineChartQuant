import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { type ColorTokens, resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign.js'
import { calcENEData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import type {
  GetTitleInfoFn,
  IndicatorPriceRangeComputer,
  IndicatorRenderStateComposer,
  TitleInfo,
  TitleValueItem,
} from '../../indicators/indicatorMetadata.js'
import { IndicatorKind, readIndicatorSeriesEntry } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { ENERenderState } from '../../indicators/state/eneState.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

type LinePoint = { x: number; y: number }

/**
 * ENE GPU：绘制上/中/下三轨。仅 sceneRenderer；失败返回 false 走 2D。
 */
function drawENEWithWebGL(
  context: RenderContext,
  data: {
    upperPoints: LinePoint[]
    middlePoints: LinePoint[]
    lowerPoints: LinePoint[]
  },
): boolean {
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )

  const lineStrips: Array<{ points: LinePoint[]; width: number; color: string }> = []
  if (data.upperPoints.length >= 2) {
    lineStrips.push({ points: data.upperPoints, width: 1, color: colors.ene.upper })
  }
  if (data.middlePoints.length >= 2) {
    lineStrips.push({ points: data.middlePoints, width: 1, color: colors.ene.middle })
  }
  if (data.lowerPoints.length >= 2) {
    lineStrips.push({ points: data.lowerPoints, width: 1, color: colors.ene.lower })
  }

  if (lineStrips.length === 0) return false
  // 线失败 → false，整图 2D 重画
  return tryDrawLinesGpu(context, lineStrips, context.scrollLeft)
}

interface ENERendererOptions {
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

const computeENEPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
  const { series } = readIndicatorSeriesEntry(bundle, 'ene')
  if (series.length === 0 || range.start >= series.length) {
    return null
  }

  let min = Infinity
  let max = -Infinity
  const end = Math.min(range.end, series.length)
  for (let i = range.start; i < end; i++) {
    const p = series[i]
    if (p) {
      min = Math.min(min, p.upper, p.middle, p.lower)
      max = Math.max(max, p.upper, p.middle, p.lower)
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

const composeENERenderState: IndicatorRenderStateComposer = (
  bundle,
  range,
  timestamp,
): ENERenderState => {
  const source = readIndicatorSeriesEntry(bundle, 'ene')
  const priceRange = computeENEPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
  return {
    timestamp,
    series: source.series,
    params: source.params,
    visibleMin: priceRange.min,
    visibleMax: priceRange.max,
  }
}

export function createENERendererPlugin(options: ENERendererOptions = {}): RendererPluginWithHost {
  const { instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: 'ene',
    version: '2.1.0',
    description: 'ENE 轨道线渲染器（无状态）',
    debugName: 'ENE轨道线',
    paneId: 'main',
    priority: RENDERER_PRIORITY.INDICATOR,

    /**
     * 安装时捕获 PluginHost 引用
     */
    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    /**
     * 声明使用的 StateStore 命名空间
     */
    getDeclaredNamespaces(): string[] {
      return instanceId ? [instanceId] : []
    },

    /**
     * 绘制 ENE 线
     * 从 StateStore 读取预计算数据，仅执行绘制
     */
    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
      const klineData = data as KLineData[]
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      // 从该实例的帧投影读取 ENE 状态
      const state = context.indicatorStateReader?.get<ENERenderState>(instanceId)

      // 无有效数据时提前返回
      if (!state || state.visibleMin > state.visibleMax) return
      if (state.series.length === 0) return

      const { period } = state.params
      const eneData = state.series

      if (klineData.length < period) return

      const drawStart = Math.max(range.start, period - 1)
      const drawEnd = Math.min(range.end, klineData.length)
      const upperPoints: LinePoint[] = []
      const middlePoints: LinePoint[] = []
      const lowerPoints: LinePoint[] = []

      for (let i = drawStart; i < drawEnd; i++) {
        const ene = eneData[i]
        if (!ene) continue

        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue

        upperPoints.push({
          x: centerX,
          y: alignToPhysicalPixelCenter(pane.yAxis.priceToY(ene.upper), dpr),
        })
        middlePoints.push({
          x: centerX,
          y: alignToPhysicalPixelCenter(pane.yAxis.priceToY(ene.middle), dpr),
        })
        lowerPoints.push({
          x: centerX,
          y: alignToPhysicalPixelCenter(pane.yAxis.priceToY(ene.lower), dpr),
        })
      }

      if (drawENEWithWebGL(context, { upperPoints, middlePoints, lowerPoints })) {
        return
      }

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const drawLine = (points: LinePoint[], color: string) => {
        if (points.length === 0) return
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(points[0]!.x, points[0]!.y)
        for (let i = 1; i < points.length; i++) {
          const point = points[i]!
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      drawLine(upperPoints, colors.ene.upper)
      drawLine(middlePoints, colors.ene.middle)
      drawLine(lowerPoints, colors.ene.lower)

      ctx.restore()
    },

    /**
     * 获取配置（兼容性接口）
     * 从 StateStore 读取实际配置
     */
    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<ENERenderState>(instanceId)
      return state ? { ...state.params } : {}
    },

    /**
     * 设置配置（兼容性接口，无实际操作）
     *
     * 重要：本渲染器为无状态设计，不持有配置。
     * 配置变更由指标实例链路更新对应实例参数后重新投影。
     */
    setConfig(_newConfig: Record<string, unknown>) {
      // 无状态渲染器不存储配置，配置变更由指标实例链路更新实例参数
    },
  }
}

const getENETitleInfo: GetTitleInfoFn = (
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  stateReader,
  instanceId,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null => {
  if (index === null) return null

  const state = stateReader.get<ENERenderState>(instanceId)
  if (!state || state.visibleMin > state.visibleMax) return null

  const enePoint = state.series[index]
  if (!enePoint) return null

  const values: TitleValueItem[] = [
    { label: 'UP', value: enePoint.upper, color: colors.ene.upper },
    { label: 'MID', value: enePoint.middle, color: colors.ene.middle },
    { label: 'DN', value: enePoint.lower, color: colors.ene.lower },
  ]

  return { name: 'ENE', params: [state.params.period, state.params.deviation], values }
}

@Indicator({
  name: 'ene',
  displayName: 'ENE',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  mainPane: {
    rendererName: 'ene',
    toActiveConfig: (params, active) => (active ? params : null),
    computePriceRange: computeENEPriceRange,
    composeRenderState: composeENERenderState,
  },
  runtime: {
    defaultParams: { period: 10, deviation: 11 },
    computeKey: 'calcENEData',
    compute: (data, c) => calcENEData(data, c.period, c.deviation),
  },
  getTitleInfo: getENETitleInfo,
})
export class ENEDefinition {
  static rendererFactory = createENERendererPlugin
}
