/**
 * Fisher Transform 指标渲染器：负责副图零轴、Fisher/Signal 双线绘制和指标元数据声明。
 */

import type {
  IndicatorRenderStateReader,
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import type { ColorTokens } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { calcFisherTransformData } from '../../indicators/calculators/fisherTransform'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { FisherTransformRenderState } from '../../indicators/state/fisherTransformState'
import {
  createFisherTransformStateKey,
  EMPTY_FISHER_TRANSFORM_STATE,
} from '../../indicators/state/fisherTransformState'
import { createPaddedPointVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createFisherTransformScaleRendererPlugin } from './scale/fisherTransform_scale'

type LinePoint = { x: number; y: number }

interface FisherTransformRendererOptions {
  /** 目标 pane ID。 */
  paneId?: string
}

/**
 * 获取 Fisher Transform 在指定 pane 上的状态键。
 * @param host 插件宿主。
 * @param paneId 目标副图 ID。
 * @returns 状态键，服务不可用时返回 null。
 */
function getFisherTransformStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[FisherTransformRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('fisherTransform')
  if (!meta) {
    console.warn(
      "[FisherTransformRenderer] Indicator metadata for 'fisherTransform' not found, skip rendering",
    )
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 Fisher Transform 渲染器插件。
 * @param options 渲染器配置。
 * @returns Fisher Transform 渲染器插件。
 */
function createFisherTransformRendererPlugin(
  options: FisherTransformRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'sub_Fisher' } = options
  let pluginHost: PluginHost | null = null

  /** 解析当前指标状态键。 */
  function resolveKey(): string | null {
    return getFisherTransformStateKey(pluginHost, paneId)
  }

  let cachedKey = ''
  let cachedFisherPoints: LinePoint[] = []
  let cachedSignalPoints: LinePoint[] = []

  /** 清空 Fisher/Signal 折线缓存。 */
  function clearLineCache(): void {
    cachedKey = ''
    cachedFisherPoints = []
    cachedSignalPoints = []
  }

  /**
   * 生成 Fisher Transform 折线缓存键。
   * @param range 当前可见数据范围。
   * @param kLineCenters 可见 K 线中心坐标。
   * @param pane 当前 pane。
   * @param params 指标配置。
   * @param stateTimestamp 指标状态时间戳。
   * @returns 缓存键。
   */
  function buildFisherTransformCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: FisherTransformRenderState['params'],
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
      params.showFisher,
      params.showSignal,
    ].join('|')
  }

  return {
    name: `fisherTransform_${paneId}`,
    version: '2.1.0',
    description: 'Fisher Transform 费舍尔变换渲染器（WebGL + Canvas2D 回退）',
    debugName: 'Fisher',
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

    /** 绘制 Fisher Transform 零轴和 Fisher/Signal 折线。 */
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const fisherColor = colors.palette.i2
      const signalColor = colors.palette.i3

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<FisherTransformRenderState>(stateKey)
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

      const drawStart = Math.max(range.start, params.period - 1)
      const drawEnd = Math.min(range.end, series.length)
      const cacheKey = buildFisherTransformCacheKey(
        range,
        kLineCenters,
        pane,
        params,
        state.timestamp,
      )

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedFisherPoints = []
        cachedSignalPoints = []
        const inverseRange = paneHeight / displayValueRange
        const rangeStart = range.start

        if (params.showFisher) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            const centerX = kLineCenters[i - rangeStart]
            if (!point || centerX === undefined) continue
            cachedFisherPoints.push({
              x: centerX,
              y: paneHeight - (point.fisher - displayMin) * inverseRange,
            })
          }
        }

        if (params.showSignal) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = series[i]
            const centerX = kLineCenters[i - rangeStart]
            if (!point || centerX === undefined) continue
            cachedSignalPoints.push({
              x: centerX,
              y: paneHeight - (point.signal - displayMin) * inverseRange,
            })
          }
        }
      }

      const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
      if (params.showFisher && cachedFisherPoints.length >= 2) {
        lines.push({ points: cachedFisherPoints, width: 1, color: fisherColor })
      }
      if (params.showSignal && cachedSignalPoints.length >= 2) {
        lines.push({ points: cachedSignalPoints, width: 1, color: signalColor })
      }
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawFisherTransformLinesWithCanvas2D(
          ctx,
          scrollLeft,
          cachedFisherPoints,
          cachedSignalPoints,
          params,
          fisherColor,
          signalColor,
        )
      }
    },

    /** 返回当前 Fisher Transform 配置。 */
    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<FisherTransformRenderState>(stateKey)
      return state?.params ?? {}
    },

    /** 配置由 IndicatorScheduler 统一更新。 */
    setConfig() {},
  }
}

/**
 * 使用 Canvas2D 绘制 Fisher/Signal 折线。
 * @param ctx 目标 Canvas2D 上下文。
 * @param scrollLeft 当前横向滚动偏移。
 * @param fisherPoints Fisher 线点集合。
 * @param signalPoints Signal 线点集合。
 * @param params 指标显示配置。
 * @param fisherColor Fisher 线颜色。
 * @param signalColor Signal 线颜色。
 */
function drawFisherTransformLinesWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  fisherPoints: LinePoint[],
  signalPoints: LinePoint[],
  params: { showFisher: boolean; showSignal: boolean },
  fisherColor: string,
  signalColor: string,
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (params.showFisher && fisherPoints.length >= 2) {
    ctx.strokeStyle = fisherColor
    ctx.beginPath()
    ctx.moveTo(fisherPoints[0]!.x, fisherPoints[0]!.y)
    for (let i = 1; i < fisherPoints.length; i++) {
      const point = fisherPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (params.showSignal && signalPoints.length >= 2) {
    ctx.strokeStyle = signalColor
    ctx.beginPath()
    ctx.moveTo(signalPoints[0]!.x, signalPoints[0]!.y)
    for (let i = 1; i < signalPoints.length; i++) {
      const point = signalPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * 获取 Fisher Transform 标题信息。
 * @param data 当前 K 线数据。
 * @param index 十字线数据索引。
 * @param params 指标配置。
 * @param pluginHost 插件宿主。
 * @param paneId 目标副图 ID。
 * @param colors 当前主题颜色。
 * @returns 标题信息，无有效值时返回 null。
 */
function getFisherTransformTitleInfo(
  _data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  paneId: string,
  colors: ColorTokens,
): {
  name: string
  params: number[]
  values: Array<{ label: string; value: number; color: string }>
} | null {
  if (index === null) return null

  const state = stateReader.get<FisherTransformRenderState>(createFisherTransformStateKey(paneId))
  if (!state) return null
  const point = state.series[index]
  if (!point) return null

  const values: Array<{ label: string; value: number; color: string }> = []
  if (state.params.showFisher) {
    values.push({ label: 'Fisher', value: point.fisher, color: colors.palette.i2 })
  }
  if (state.params.showSignal) {
    values.push({ label: 'Signal', value: point.signal, color: colors.palette.i3 })
  }
  if (values.length === 0) return null

  return {
    name: 'Fisher',
    params: [(params.period as number) ?? 10],
    values,
  }
}

@Indicator({
  name: 'fisherTransform',
  displayName: 'Fisher',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_Fisher',
  scaleRendererFactory: createFisherTransformScaleRendererPlugin,
  visibleState: {
    compose: createPaddedPointVisibleStateComposer(
      'fisherTransform',
      EMPTY_FISHER_TRANSFORM_STATE,
      ['fisher', 'signal'] as const,
    ),
  },
  getTitleInfo: getFisherTransformTitleInfo,
  presentation: { defaultOptions: { showFisher: true, showSignal: true } },
  runtime: {
    defaultParams: { period: 10 },
    computeKey: 'calcFisherTransformData',
    compute: (data: KLineData[], c) => calcFisherTransformData(data, c.period),
  },
})
export class FisherTransformIndicatorDefinition {
  static rendererFactory = createFisherTransformRendererPlugin
}
