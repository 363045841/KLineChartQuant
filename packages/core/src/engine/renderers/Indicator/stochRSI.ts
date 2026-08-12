/**
 * StochRSI 指标渲染器：负责副图零轴、K/D 双线绘制和指标元数据声明。
 */

import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import type { ColorTokens } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { calcStochRSIData } from '../../indicators/calculators/stochRSI'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { StochRSIRenderState } from '../../indicators/state/stochRSIState'
import { createStochRSIStateKey, EMPTY_STOCH_RSI_STATE } from '../../indicators/state/stochRSIState'
import { createPaddedPointVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createStochRSIScaleRendererPlugin } from './scale/stochRSI_scale'

type LinePoint = { x: number; y: number }

interface StochRSIRendererOptions {
  /** 目标 pane ID。 */
  paneId?: string
}

/**
 * 获取 StochRSI 在指定 pane 上的状态键。
 * @param host 插件宿主。
 * @param paneId 目标副图 ID。
 * @returns 状态键，服务不可用时返回 null。
 */
function getStochRSIStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[StochRSIRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('stochRSI')
  if (!meta) {
    console.warn("[StochRSIRenderer] Indicator metadata for 'stochRSI' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 StochRSI 渲染器插件。
 * @param options 渲染器配置。
 * @returns StochRSI 渲染器插件。
 */
function createStochRSIRendererPlugin(
  options: StochRSIRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'sub_StochRSI' } = options
  let pluginHost: PluginHost | null = null

  /** 解析当前指标状态键。 */
  function resolveKey(): string | null {
    return getStochRSIStateKey(pluginHost, paneId)
  }

  let cachedKey = ''
  let cachedKPoints: LinePoint[] = []
  let cachedDPoints: LinePoint[] = []

  /** 清空 K/D 折线缓存。 */
  function clearLineCache(): void {
    cachedKey = ''
    cachedKPoints = []
    cachedDPoints = []
  }

  /**
   * 生成 StochRSI 折线缓存键。
   * @param range 当前可见数据范围。
   * @param kLineCenters 可见 K 线中心坐标。
   * @param pane 当前 pane。
   * @param params 指标配置。
   * @param stateTimestamp 指标状态时间戳。
   * @returns 缓存键。
   */
  function buildStochRSICacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: StochRSIRenderState['params'],
    stateTimestamp: number,
  ): string {
    const displayRange = pane.yAxis.getDisplayRange()
    return [
      stateTimestamp,
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      displayRange.maxPrice.toFixed(6),
      displayRange.minPrice.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      params.period,
      params.kPeriod,
      params.dPeriod,
      params.showK,
      params.showD,
    ].join('|')
  }

  return {
    name: `stochRSI_${paneId}`,
    version: '2.1.0',
    description: 'StochRSI 随机相对强弱指标渲染器（WebGL + Canvas2D 回退）',
    debugName: 'StochRSI',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    /** 保存插件宿主，供绘制时读取共享状态。 */
    onInstall(host: PluginHost) {
      pluginHost = host
    },

    /** 声明此渲染器拥有的状态命名空间。 */
    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    /** 绘制 StochRSI 零轴和 K/D 折线。 */
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const kColor = colors.palette.i2
      const dColor = colors.palette.i3

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<StochRSIRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax) {
        clearLineCache()
        return
      }

      const { valueMin, valueMax, params, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneHeight = pane.height

      const zeroY = paneHeight - ((0 - displayMin) / displayValueRange) * paneHeight
      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.referenceLine.neutral
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(scrollLeft, zeroY)
      ctx.lineTo(scrollLeft + context.paneWidth, zeroY)
      ctx.stroke()
      ctx.restore()

      const firstReadyIndex = params.period * 2 + params.kPeriod + params.dPeriod - 3
      const drawStart = Math.max(range.start, firstReadyIndex)
      const drawEnd = Math.min(range.end, series.length)
      const cacheKey = buildStochRSICacheKey(range, kLineCenters, pane, params, state.timestamp)

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedKPoints = []
        cachedDPoints = []
        const inverseRange = paneHeight / displayValueRange
        const rangeStart = range.start

        if (params.showK) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            const centerX = kLineCenters[i - rangeStart]
            if (!point || centerX === undefined) continue
            cachedKPoints.push({
              x: centerX,
              y: paneHeight - (point.k - displayMin) * inverseRange,
            })
          }
        }

        if (params.showD) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            const centerX = kLineCenters[i - rangeStart]
            if (!point || centerX === undefined) continue
            cachedDPoints.push({
              x: centerX,
              y: paneHeight - (point.d - displayMin) * inverseRange,
            })
          }
        }
      }

      const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
      if (params.showK && cachedKPoints.length >= 2) {
        lines.push({ points: cachedKPoints, width: 1, color: kColor })
      }
      if (params.showD && cachedDPoints.length >= 2) {
        lines.push({ points: cachedDPoints, width: 1, color: dColor })
      }
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawStochRSILinesWithCanvas2D(
          ctx,
          scrollLeft,
          cachedKPoints,
          cachedDPoints,
          params,
          kColor,
          dColor,
        )
      }
    },

    /** 返回当前 StochRSI 配置。 */
    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<StochRSIRenderState>(stateKey)
      return state?.params ?? {}
    },

    /** 配置由 IndicatorScheduler 统一更新。 */
    setConfig() {},
  }
}

/**
 * 使用 Canvas2D 绘制 StochRSI K/D 折线。
 * @param ctx 目标 Canvas2D 上下文。
 * @param scrollLeft 当前横向滚动偏移。
 * @param kPoints K 线点集合。
 * @param dPoints D 线点集合。
 * @param params 指标显示配置。
 * @param kColor K 线颜色。
 * @param dColor D 线颜色。
 */
function drawStochRSILinesWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  kPoints: LinePoint[],
  dPoints: LinePoint[],
  params: { showK: boolean; showD: boolean },
  kColor: string,
  dColor: string,
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (params.showK && kPoints.length >= 2) {
    ctx.strokeStyle = kColor
    ctx.beginPath()
    ctx.moveTo(kPoints[0]!.x, kPoints[0]!.y)
    for (let i = 1; i < kPoints.length; i++) {
      const point = kPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (params.showD && dPoints.length >= 2) {
    ctx.strokeStyle = dColor
    ctx.beginPath()
    ctx.moveTo(dPoints[0]!.x, dPoints[0]!.y)
    for (let i = 1; i < dPoints.length; i++) {
      const point = dPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * 获取 StochRSI 标题信息。
 * @param data 当前 K 线数据。
 * @param index 十字线数据索引。
 * @param params 指标配置。
 * @param pluginHost 插件宿主。
 * @param paneId 目标副图 ID。
 * @param colors 当前主题颜色。
 * @returns 标题信息，无有效值时返回 null。
 */
function getStochRSITitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  pluginHost: PluginHost,
  paneId: string,
  colors: ColorTokens,
): {
  name: string
  params: number[]
  values: Array<{ label: string; value: number; color: string }>
} | null {
  if (index === null) return null

  const state = pluginHost.getSharedState<StochRSIRenderState>(createStochRSIStateKey(paneId))
  if (!state) return null
  const point = state.series[index]
  if (!point) return null

  const values: Array<{ label: string; value: number; color: string }> = []
  if (state.params.showK) values.push({ label: 'K', value: point.k, color: colors.palette.i2 })
  if (state.params.showD) values.push({ label: 'D', value: point.d, color: colors.palette.i3 })
  if (values.length === 0) return null

  return {
    name: 'StochRSI',
    params: [
      (params.period as number) ?? 14,
      (params.kPeriod as number) ?? 3,
      (params.dPeriod as number) ?? 3,
    ],
    values,
  }
}

@Indicator({
  name: 'stochRSI',
  displayName: 'StochRSI',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_StochRSI',
  scaleRendererFactory: createStochRSIScaleRendererPlugin,
  visibleState: {
    compose: createPaddedPointVisibleStateComposer('stochRSI', EMPTY_STOCH_RSI_STATE, [
      'k',
      'd',
    ] as const),
  },
  getTitleInfo: getStochRSITitleInfo,
  runtime: {
    defaultConfig: { period: 14, kPeriod: 3, dPeriod: 3, showK: true, showD: true },
    computeKey: 'calcStochRSIData',
    compute: (data: KLineData[], c: StochRSIRenderState['params']) =>
      calcStochRSIData(data, c.period, c.kPeriod, c.dPeriod),
  },
})
export class StochRSIIndicatorDefinition {
  static rendererFactory = createStochRSIRendererPlugin
}
