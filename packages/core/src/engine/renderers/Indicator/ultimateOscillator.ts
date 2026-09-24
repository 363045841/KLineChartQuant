/**
 * Ultimate Oscillator 指标渲染器：负责副图零轴、单线绘制和指标元数据声明。
 */

import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { alignToPhysicalPixelCenter } from '../../../foundation/utils/pixelAlign.js'
import { calcUltimateOscillatorData } from '../../indicators/calculators/ultimateOscillator.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { UltimateOscillatorRenderState } from '../../indicators/state/ultimateOscillatorState.js'
import {
  DEFAULT_UO_P1,
  DEFAULT_UO_P2,
  DEFAULT_UO_P3,
  EMPTY_UO_STATE,
} from '../../indicators/state/ultimateOscillatorState.js'
import { createPaddedSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'

import { tryDrawLinesGpu } from '../linesViaRenderer.js'

import { createUltimateOscillatorScaleRendererPlugin } from './scale/ultimateOscillator_scale.js'
import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

interface UltimateOscillatorRendererOptions {
  /** 目标 pane ID。 */
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/**
 * 创建 UO 渲染器插件。
 * @param options 渲染器配置。
 * @returns UO 渲染器插件。
 */
function createUltimateOscillatorRendererPlugin(
  options: UltimateOscillatorRendererOptions = {},
): RendererPluginWithHost {
  const { paneId = 'sub_UO', instanceId } = options
  let pluginHost: PluginHost | null = null

  let cachedKey = ''
  let cachedUOPoints: LinePoint[] = []
  let offscreenCanvas: HTMLCanvasElement | null = null
  let offscreenCtx: CanvasRenderingContext2D | null = null
  let cachedZeroLineKey = ''

  /** 清空 UO 折线缓存。 */
  function clearLineCache(): void {
    cachedKey = ''
    cachedUOPoints = []
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

  /** 生成 UO 折线缓存键。 */
  function buildUOCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: UltimateOscillatorRenderState['params'],
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
      params.showUO,
      params.p1,
      params.p2,
      params.p3,
    ].join('|')
  }

  return {
    name: `ultimateOscillator_${paneId}`,
    version: '2.1.0',
    description: 'UO 终极振荡器渲染器（WebGL + Canvas2D 回退）',
    debugName: 'UO',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    /** 保存插件宿主，供绘制时读取共享状态。 */
    onInstall(host: PluginHost) {
      pluginHost = host
    },

    /** 声明此渲染器拥有的状态命名空间。 */
    getDeclaredNamespaces() {
      return instanceId ? [instanceId] : []
    },

    /** 绘制 UO 零轴和主折线。 */
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<UltimateOscillatorRenderState>(instanceId)
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

      const drawStart = Math.max(range.start, Math.max(params.p1, params.p2, params.p3))
      const drawEnd = Math.min(range.end, series.length)
      const cacheKey = buildUOCacheKey(range, kLineCenters, pane, params, state.timestamp)

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedUOPoints = []
        const invRange = paneHeight / displayValueRange
        const rangeStart = range.start

        if (params.showUO) {
          for (let i = drawStart; i < drawEnd; i++) {
            const value = series[i]
            if (value === undefined) continue
            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue
            cachedUOPoints.push({ x: centerX, y: paneHeight - (value - displayMin) * invRange })
          }
        }
      }

      const lines =
        params.showUO && cachedUOPoints.length >= 2
          ? [{ points: cachedUOPoints, width: 1, color: colors.palette.i7 }]
          : []
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawUltimateOscillatorLineWithCanvas2D(
          ctx,
          scrollLeft,
          cachedUOPoints,
          params.showUO,
          colors.palette.i7,
        )
      }
    },

    /** 返回当前 UO 配置。 */
    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<UltimateOscillatorRenderState>(instanceId)
      return state?.params ?? {}
    },

    /** 配置由外部统一更新。 */
    setConfig() {},
  }
}

/**
 * 使用 Canvas2D 绘制 UO 折线。
 * @param ctx 目标 Canvas2D 上下文。
 * @param scrollLeft 当前横向滚动偏移。
 * @param points 折线点集合。
 * @param showUO 是否显示指标线。
 * @param lineColor 指标线颜色。
 */
function drawUltimateOscillatorLineWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  points: LinePoint[],
  showUO: boolean,
  lineColor: string,
): void {
  if (!showUO || points.length < 2) return

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

const getUltimateOscillatorTitleInfo = createSingleLineTitleInfo({
  name: 'UO',
  label: 'UO',
  getParams: (params) => [
    (params.p1 as number) ?? DEFAULT_UO_P1,
    (params.p2 as number) ?? DEFAULT_UO_P2,
    (params.p3 as number) ?? DEFAULT_UO_P3,
  ],
  getColor: (colors) => colors.palette.i7,
})

@Indicator({
  name: 'ultimateOscillator',
  displayName: 'UO',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_UO',
  scaleRendererFactory: createUltimateOscillatorScaleRendererPlugin,
  visibleState: {
    compose: createPaddedSparseVisibleStateComposer('ultimateOscillator', EMPTY_UO_STATE),
  },
  getTitleInfo: getUltimateOscillatorTitleInfo,
  presentation: { defaultOptions: { showUO: true } },
  runtime: {
    defaultParams: { p1: DEFAULT_UO_P1, p2: DEFAULT_UO_P2, p3: DEFAULT_UO_P3 },
    computeKey: 'calcUltimateOscillatorData',
    compute: (data: KLineData[], c) => calcUltimateOscillatorData(data, c.p1, c.p2, c.p3),
  },
})
export class UltimateOscillatorIndicatorDefinition {
  static rendererFactory = createUltimateOscillatorRendererPlugin
}
