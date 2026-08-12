/**
 * Schaff Trend Cycle 指标渲染器：负责副图零轴、单线绘制和指标元数据声明。
 */

import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign'
import { calcSchaffTrendCycleData } from '../../indicators/calculators/schaffTrendCycle'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { SchaffTrendCycleRenderState } from '../../indicators/state/schaffTrendCycleState'
import {
  createSchaffTrendCycleStateKey,
  EMPTY_SCHAFF_TREND_CYCLE_STATE,
} from '../../indicators/state/schaffTrendCycleState'
import { createPaddedSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSchaffTrendCycleScaleRendererPlugin } from './scale/schaffTrendCycle_scale'
import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

interface SchaffTrendCycleRendererOptions {
  /** 目标 pane ID。 */
  paneId?: string
}

/**
 * 获取 STC 在指定 pane 上的状态键。
 * @param host 插件宿主。
 * @param paneId 目标副图 ID。
 * @returns 状态键，服务不可用时返回 null。
 */
function getSchaffTrendCycleStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[SchaffTrendCycleRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('schaffTrendCycle')
  if (!meta) {
    console.warn(
      "[SchaffTrendCycleRenderer] Indicator metadata for 'schaffTrendCycle' not found, skip rendering",
    )
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 Schaff Trend Cycle 渲染器插件。
 * @param options 渲染器配置。
 * @returns STC 渲染器插件。
 */
function createSchaffTrendCycleRendererPlugin(
  options: SchaffTrendCycleRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'sub_STC' } = options
  let pluginHost: PluginHost | null = null

  /** 解析当前指标状态键。 */
  function resolveKey(): string | null {
    return getSchaffTrendCycleStateKey(pluginHost, paneId)
  }

  let cachedKey = ''
  let cachedSTCPoints: LinePoint[] = []
  let offscreenCanvas: HTMLCanvasElement | null = null
  let offscreenContext: CanvasRenderingContext2D | null = null
  let cachedZeroLineKey = ''

  /** 清空 STC 折线缓存。 */
  function clearLineCache(): void {
    cachedKey = ''
    cachedSTCPoints = []
  }

  /**
   * 获取与当前物理尺寸匹配的离屏画布。
   * @param width 物理像素宽度。
   * @param height 物理像素高度。
   * @returns 离屏画布及其 2D 上下文。
   */
  function getOffscreenCanvas(
    width: number,
    height: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas = document.createElement('canvas')
      offscreenCanvas.width = width
      offscreenCanvas.height = height
      offscreenContext = offscreenCanvas.getContext('2d')!
      cachedZeroLineKey = ''
    }
    return { canvas: offscreenCanvas, ctx: offscreenContext! }
  }

  /**
   * 生成零轴离屏缓存键。
   * @param paneWidth pane 逻辑宽度。
   * @param paneHeight pane 逻辑高度。
   * @param displayMin 坐标轴显示最小值。
   * @param displayMax 坐标轴显示最大值。
   * @param dpr 设备像素比。
   * @param color 零轴颜色。
   * @returns 缓存键。
   */
  function buildZeroLineKey(
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    color: string,
  ): string {
    return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}|${color}`
  }

  /**
   * 将零轴绘制到离屏画布。
   * @param ctx 离屏 2D 上下文。
   * @param paneWidth pane 逻辑宽度。
   * @param paneHeight pane 逻辑高度。
   * @param displayMin 坐标轴显示最小值。
   * @param displayMax 坐标轴显示最大值。
   * @param dpr 设备像素比。
   * @param color 零轴颜色。
   */
  function renderZeroLineToOffscreen(
    ctx: CanvasRenderingContext2D,
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    color: string,
  ): void {
    const displayValueRange = displayMax - displayMin || 1
    const zeroY = alignToPhysicalPixelCenter(
      paneHeight - ((0 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, zeroY)
    ctx.lineTo(paneWidth, zeroY)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * 生成 STC 折线缓存键。
   * @param range 当前可见数据范围。
   * @param kLineCenters 可见 K 线中心坐标。
   * @param pane 当前 pane。
   * @param params 指标配置。
   * @param stateTimestamp 指标状态时间戳。
   * @returns 缓存键。
   */
  function buildSchaffTrendCycleCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: SchaffTrendCycleRenderState['params'],
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
      params.fast,
      params.slow,
      params.cycle,
      params.factor,
      params.showSTC,
    ].join('|')
  }

  return {
    name: `schaffTrendCycle_${paneId}`,
    version: '2.1.0',
    description: 'STC Schaff 趋势周期渲染器（WebGL + Canvas2D 回退）',
    debugName: 'STC',
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

    /** 绘制 STC 零轴和主折线。 */
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const lineColor = colors.palette.i2
      const zeroLineColor = colors.referenceLine.neutral

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<SchaffTrendCycleRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax) {
        clearLineCache()
        return
      }

      const { valueMin, valueMax, params, series } = state
      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1
      const paneWidth = context.paneWidth
      const paneHeight = pane.height
      const zeroLineKey = buildZeroLineKey(
        paneWidth,
        paneHeight,
        displayMin,
        displayMax,
        dpr,
        zeroLineColor,
      )

      if (cachedZeroLineKey !== zeroLineKey) {
        cachedZeroLineKey = zeroLineKey
        const { ctx: offscreenCtx } = getOffscreenCanvas(
          Math.ceil(paneWidth * dpr),
          Math.ceil(paneHeight * dpr),
        )
        renderZeroLineToOffscreen(
          offscreenCtx,
          paneWidth,
          paneHeight,
          displayMin,
          displayMax,
          dpr,
          zeroLineColor,
        )
      }

      if (offscreenCanvas) ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)

      const drawStart = Math.max(range.start, params.cycle * 2 - 2)
      const drawEnd = Math.min(range.end, series.length)
      const cacheKey = buildSchaffTrendCycleCacheKey(
        range,
        kLineCenters,
        pane,
        params,
        state.timestamp,
      )

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedSTCPoints = []
        const inverseRange = paneHeight / displayValueRange
        const rangeStart = range.start

        if (params.showSTC) {
          for (let i = drawStart; i < drawEnd; i++) {
            const value = series[i]
            const centerX = kLineCenters[i - rangeStart]
            if (value === undefined || centerX === undefined) continue
            cachedSTCPoints.push({
              x: centerX,
              y: paneHeight - (value - displayMin) * inverseRange,
            })
          }
        }
      }

      const lines =
        params.showSTC && cachedSTCPoints.length >= 2
          ? [{ points: cachedSTCPoints, width: 1, color: lineColor }]
          : []
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawSchaffTrendCycleLineWithCanvas2D(
          ctx,
          scrollLeft,
          cachedSTCPoints,
          params.showSTC,
          lineColor,
        )
      }
    },

    /** 返回当前 STC 配置。 */
    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<SchaffTrendCycleRenderState>(stateKey)
      return state?.params ?? {}
    },

    /** 配置由 IndicatorScheduler 统一更新。 */
    setConfig() {},
  }
}

/**
 * 使用 Canvas2D 绘制 STC 折线。
 * @param ctx 目标 Canvas2D 上下文。
 * @param scrollLeft 当前横向滚动偏移。
 * @param points STC 点集合。
 * @param showSTC 是否显示 STC。
 * @param lineColor STC 线颜色。
 */
function drawSchaffTrendCycleLineWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  points: LinePoint[],
  showSTC: boolean,
  lineColor: string,
): void {
  if (!showSTC || points.length < 2) return

  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
  ctx.restore()
}

const getSchaffTrendCycleTitleInfo = createSingleLineTitleInfo({
  createStateKey: createSchaffTrendCycleStateKey,
  name: 'STC',
  label: 'STC',
  getParams: (params) => [
    (params.fast as number) ?? 23,
    (params.slow as number) ?? 50,
    (params.cycle as number) ?? 10,
    (params.factor as number) ?? 0.5,
  ],
  getColor: (colors) => colors.palette.i2,
})

@Indicator({
  name: 'schaffTrendCycle',
  displayName: 'STC',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_STC',
  scaleRendererFactory: createSchaffTrendCycleScaleRendererPlugin,
  visibleState: {
    compose: createPaddedSparseVisibleStateComposer(
      'schaffTrendCycle',
      EMPTY_SCHAFF_TREND_CYCLE_STATE,
    ),
  },
  getTitleInfo: getSchaffTrendCycleTitleInfo,
  runtime: {
    defaultConfig: { fast: 23, slow: 50, cycle: 10, factor: 0.5, showSTC: true },
    computeKey: 'calcSchaffTrendCycleData',
    compute: (data, c: SchaffTrendCycleRenderState['params']) =>
      calcSchaffTrendCycleData(data, c.fast, c.slow, c.cycle, c.factor),
  },
})
export class SchaffTrendCycleIndicatorDefinition {
  static rendererFactory = createSchaffTrendCycleRendererPlugin
}
