import type {
  RendererPluginWithHost,
  PluginHost,
  RenderContext,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors, type ColorTokens } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign'
import { calcENEData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type {
  IndicatorPriceRangeComputer,
  IndicatorRenderStateComposer,
  GetTitleInfoFn,
  TitleInfo,
  TitleValueItem,
} from '../../indicators/indicatorMetadata'
import type { ENESchedulerConfig, IndicatorScheduler } from '../../indicators/scheduler'
import { ENE_STATE_KEY, type ENERenderState } from '../../indicators/state/eneState'

import { getRgbaAlpha, toOpaqueRgba } from './shared/webglBand'
import { tryDrawFilledBandGpu, tryDrawLinesGpu } from '../linesViaRenderer'

type LinePoint = { x: number; y: number }

/**
 * ENE GPU：先 band fill 再上/中/下轨。仅 sceneRenderer；失败返回 false 走 2D。
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
  // band 默认 false：无 surface 时不得假成功跳过 2D
  let bandOk = false
  if (data.upperPoints.length >= 2 && data.lowerPoints.length >= 2) {
    bandOk = tryDrawFilledBandGpu(
      context,
      data.upperPoints,
      data.lowerPoints,
      toOpaqueRgba(colors.ene.bandFill),
      context.scrollLeft,
      getRgbaAlpha(colors.ene.bandFill),
    )
  }

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

  if (lineStrips.length === 0) return bandOk
  // 线失败 → false，整图 2D 重画（含 band）
  return tryDrawLinesGpu(context, lineStrips, context.scrollLeft)
}

/** 创建 ENE（轨道线）渲染器插件（无状态版本）
 *
 * 设计原则：
 * 1. 不持有任何计算缓存或配置状态
 * 2. 所有数据从 StateStore 读取（通过 ENE_STATE_KEY）
 * 3. 配置变更通过外部 IndicatorScheduler 处理
 * 4. 纯绘制函数，无副作用
 */
function getENEStateKey(host: PluginHost | null): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[ENERenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('ene')
  if (!meta) {
    console.warn("[ENERenderer] Indicator metadata for 'ene' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey)
}

const computeENEPriceRange: IndicatorPriceRangeComputer = (bundle, range) => {
  const series = bundle.ene.series
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
  const priceRange = computeENEPriceRange(bundle, range) ?? { min: Infinity, max: -Infinity }
  return {
    timestamp,
    series: bundle.ene.series,
    params: bundle.ene.params,
    visibleMin: priceRange.min,
    visibleMax: priceRange.max,
  }
}

export function createENERendererPlugin(): RendererPluginWithHost {
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getENEStateKey(pluginHost)
  }

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
      const key = resolveKey()
      return key ? [key] : []
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

      const stateKey = resolveKey()
      if (!stateKey) return
      // 从 StateStore 读取 ENE 状态
      const state = pluginHost?.getSharedState<ENERenderState>(stateKey)

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

      ctx.fillStyle = colors.ene.bandFill
      ctx.beginPath()
      if (upperPoints.length > 0) {
        ctx.moveTo(upperPoints[0]!.x, upperPoints[0]!.y)
        for (let i = 1; i < upperPoints.length; i++) {
          const point = upperPoints[i]!
          ctx.lineTo(point.x, point.y)
        }
        for (let i = lowerPoints.length - 1; i >= 0; i--) {
          const point = lowerPoints[i]!
          ctx.lineTo(point.x, point.y)
        }
      }
      ctx.closePath()
      ctx.fill()

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
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<ENERenderState>(stateKey)
      return state ? { ...state.params } : {}
    },

    /**
     * 设置配置（兼容性接口，无实际操作）
     *
     * 重要：本渲染器为无状态设计，不持有配置。
     * 配置变更应通过外部控制器调用 IndicatorScheduler.updateIndicatorConfig() 完成。
     */
    setConfig(_newConfig: Record<string, unknown>) {
      // 无状态渲染器不存储配置
      // 外部控制器应调用 chart.getIndicatorScheduler().updateIndicatorConfig()
    },
  }
}

const getENETitleInfo: GetTitleInfoFn = (
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  pluginHost: PluginHost,
  _paneId: string,
  colors: ColorTokens,
): TitleInfo | null => {
  if (index === null) return null

  const stateKey = getENEStateKey(pluginHost)
  if (!stateKey) return null

  const state = pluginHost?.getSharedState<ENERenderState>(stateKey)
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
  category: 'main',
  indicatorType: 'channel',
  defaultPaneId: 'main',
  mainPane: {
    rendererName: 'ene',
    toActiveConfig: (params, active) => (active ? params : null),
    computePriceRange: computeENEPriceRange,
    composeRenderState: composeENERenderState,
  },
  semantic: {
    apply: (chart, indicator) => {
      const params = (indicator as { params?: { period?: number; deviation?: number } }).params
      chart.updateRendererConfig('ene', {
        period: params?.period || 10,
        deviation: params?.deviation || 11,
      })
    },
  },
  runtime: {
    defaultConfig: { period: 10, deviation: 11 },
    computeKey: 'calcENEData',
    compute: (data, c) => calcENEData(data, c.period, c.deviation),
  },
  getTitleInfo: getENETitleInfo,
})
export class ENEDefinition {
  static rendererFactory = createENERendererPlugin
}
