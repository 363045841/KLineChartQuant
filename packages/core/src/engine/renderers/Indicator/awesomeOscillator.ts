/**
 * Awesome Oscillator 指标渲染器：负责副图零轴、单线绘制和指标元数据声明。
 */

import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign'
import { calcAwesomeOscillatorData } from '../../indicators/calculators/awesomeOscillator'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { AwesomeOscillatorRenderState } from '../../indicators/state/awesomeOscillatorState'
import {
  createAwesomeOscillatorStateKey,
  DEFAULT_AO_FAST_PERIOD,
  DEFAULT_AO_SLOW_PERIOD,
  EMPTY_AO_STATE,
} from '../../indicators/state/awesomeOscillatorState'
import { createPaddedSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createAwesomeOscillatorScaleRendererPlugin } from './scale/awesomeOscillator_scale'
import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

interface AwesomeOscillatorRendererOptions {
  /** 目标 pane ID。 */
  paneId?: string
}

/**
 * 获取 AO 在指定 pane 上的状态键。
 * @param host 插件宿主。
 * @param paneId 目标副图 ID。
 * @returns 状态键，服务不可用时返回 null。
 */
function getAwesomeOscillatorStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[AwesomeOscillatorRenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('awesomeOscillator')
  if (!meta) {
    console.warn(
      "[AwesomeOscillatorRenderer] Indicator metadata for 'awesomeOscillator' not found, skip rendering",
    )
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 AO 渲染器插件。
 * @param options 渲染器配置。
 * @returns AO 渲染器插件。
 */
function createAwesomeOscillatorRendererPlugin(
  options: AwesomeOscillatorRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'sub_AO' } = options
  let pluginHost: PluginHost | null = null

  /** 解析当前指标状态键。 */
  function resolveKey(): string | null {
    return getAwesomeOscillatorStateKey(pluginHost, paneId)
  }

  let cachedKey = ''
  let cachedAOPoints: LinePoint[] = []
  let offscreenCanvas: HTMLCanvasElement | null = null
  let offscreenCtx: CanvasRenderingContext2D | null = null
  let cachedZeroLineKey = ''

  /** 清空 AO 折线缓存。 */
  function clearLineCache(): void {
    cachedKey = ''
    cachedAOPoints = []
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
      offscreenCtx = offscreenCanvas.getContext('2d')!
      cachedZeroLineKey = ''
    }
    return { canvas: offscreenCanvas, ctx: offscreenCtx! }
  }

  /** 生成零轴离屏缓存键。 */
  function buildZeroLineKey(
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
  ): string {
    return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}`
  }

  /**
   * 将零轴绘制到离屏画布。
   * @param ctx 离屏 2D 上下文。
   * @param paneWidth pane 逻辑宽度。
   * @param paneHeight pane 逻辑高度。
   * @param displayMin 坐标轴显示最小值。
   * @param displayMax 坐标轴显示最大值。
   * @param dpr 设备像素比。
   * @param zeroColor 零轴颜色。
   */
  function renderZeroLineToOffscreen(
    ctx: CanvasRenderingContext2D,
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    zeroColor: string,
  ): void {
    const displayValueRange = displayMax - displayMin || 1
    const zeroY = alignToPhysicalPixelCenter(
      paneHeight - ((0 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = zeroColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, zeroY)
    ctx.lineTo(paneWidth, zeroY)
    ctx.stroke()
    ctx.restore()
  }

  /** 生成 AO 折线缓存键。 */
  function buildAOCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: AwesomeOscillatorRenderState['params'],
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
      params.showAO,
      params.fast,
      params.slow,
    ].join('|')
  }

  return {
    name: `awesomeOscillator_${paneId}`,
    version: '2.1.0',
    description: 'AO 动量振荡器渲染器（WebGL + Canvas2D 回退）',
    debugName: 'AO',
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

    /** 绘制 AO 零轴和主折线。 */
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<AwesomeOscillatorRenderState>(stateKey)
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
      const zeroLineKey = buildZeroLineKey(paneWidth, paneHeight, displayMin, displayMax, dpr)

      if (cachedZeroLineKey !== zeroLineKey) {
        cachedZeroLineKey = zeroLineKey
        const { ctx: offCtx } = getOffscreenCanvas(
          Math.ceil(paneWidth * dpr),
          Math.ceil(paneHeight * dpr),
        )
        renderZeroLineToOffscreen(
          offCtx,
          paneWidth,
          paneHeight,
          displayMin,
          displayMax,
          dpr,
          colors.referenceLine.neutral,
        )
      }

      if (offscreenCanvas) ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)

      const drawStart = Math.max(range.start, params.slow - 1)
      const drawEnd = Math.min(range.end, series.length)
      const cacheKey = buildAOCacheKey(range, kLineCenters, pane, params, state.timestamp)

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedAOPoints = []
        const invRange = paneHeight / displayValueRange
        const rangeStart = range.start

        if (params.showAO) {
          for (let i = drawStart; i < drawEnd; i++) {
            const value = series[i]
            if (value === undefined) continue
            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue
            cachedAOPoints.push({ x: centerX, y: paneHeight - (value - displayMin) * invRange })
          }
        }
      }

      const lines =
        params.showAO && cachedAOPoints.length >= 2
          ? [{ points: cachedAOPoints, width: 1, color: colors.palette.i6 }]
          : []
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawAwesomeOscillatorLineWithCanvas2D(
          ctx,
          scrollLeft,
          cachedAOPoints,
          params.showAO,
          colors.palette.i6,
        )
      }
    },

    /** 返回当前 AO 配置。 */
    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<AwesomeOscillatorRenderState>(stateKey)
      return state?.params ?? {}
    },

    /** 配置由 IndicatorScheduler 统一更新。 */
    setConfig() {},
  }
}

/**
 * 使用 Canvas2D 绘制 AO 折线。
 * @param ctx 目标 Canvas2D 上下文。
 * @param scrollLeft 当前横向滚动偏移。
 * @param points 折线点集合。
 * @param showAO 是否显示指标线。
 * @param lineColor 指标线颜色。
 */
function drawAwesomeOscillatorLineWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  points: LinePoint[],
  showAO: boolean,
  lineColor: string,
): void {
  if (!showAO || points.length < 2) return

  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y)
  ctx.stroke()
  ctx.restore()
}

const getAwesomeOscillatorTitleInfo = createSingleLineTitleInfo({
  createStateKey: createAwesomeOscillatorStateKey,
  name: 'AO',
  label: 'AO',
  getParams: (params) => [
    (params.fast as number) ?? DEFAULT_AO_FAST_PERIOD,
    (params.slow as number) ?? DEFAULT_AO_SLOW_PERIOD,
  ],
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'awesomeOscillator',
  displayName: 'AO',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_AO',
  scaleRendererFactory: createAwesomeOscillatorScaleRendererPlugin,
  visibleState: {
    compose: createPaddedSparseVisibleStateComposer('awesomeOscillator', EMPTY_AO_STATE),
  },
  getTitleInfo: getAwesomeOscillatorTitleInfo,
  runtime: {
    defaultConfig: {
      fast: DEFAULT_AO_FAST_PERIOD,
      slow: DEFAULT_AO_SLOW_PERIOD,
      showAO: true,
    },
    computeKey: 'calcAwesomeOscillatorData',
    compute: (data: KLineData[], c: AwesomeOscillatorRenderState['params']) =>
      calcAwesomeOscillatorData(data, c.fast, c.slow),
  },
})
export class AwesomeOscillatorIndicatorDefinition {
  static rendererFactory = createAwesomeOscillatorRendererPlugin
}
