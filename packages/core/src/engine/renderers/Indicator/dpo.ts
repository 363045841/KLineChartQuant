/**
 * DPO 指标渲染器：负责副图零轴、单线绘制和指标元数据声明。
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
import { calcDPOData } from '../../indicators/calculators/dpo'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { DPORenderState } from '../../indicators/state/dpoState'
import { createDPOStateKey, EMPTY_DPO_STATE } from '../../indicators/state/dpoState'
import { createPaddedSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'

import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createDpoScaleRendererPlugin } from './scale/dpo_scale'
import { createSingleLineTitleInfo } from './shared/titleInfo'

type LinePoint = { x: number; y: number }

interface DPORendererOptions {
  /** 目标 pane ID。 */
  paneId?: string
}

/**
 * 获取 DPO 在指定 pane 上的状态键。
 * @param host 插件宿主。
 * @param paneId 目标副图 ID。
 * @returns 状态键，服务不可用时返回 null。
 */
function getDPOStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[DPORenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('dpo')
  if (!meta) {
    console.warn("[DPORenderer] Indicator metadata for 'dpo' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 DPO 渲染器插件。
 * @param options 渲染器配置。
 * @returns DPO 渲染器插件。
 */
function createDPORendererPlugin(options: DPORendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub_DPO' } = options
  let pluginHost: PluginHost | null = null

  /** 解析当前指标状态键。 */
  function resolveKey(): string | null {
    return getDPOStateKey(pluginHost, paneId)
  }

  let cachedKey = ''
  let cachedDPOPoints: LinePoint[] = []
  let offscreenCanvas: HTMLCanvasElement | null = null
  let offscreenCtx: CanvasRenderingContext2D | null = null
  let cachedZeroLineKey = ''

  /** 清空 DPO 折线缓存。 */
  function clearLineCache(): void {
    cachedKey = ''
    cachedDPOPoints = []
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

  /** 生成 DPO 折线缓存键。 */
  function buildDPOCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: DPORenderState['params'],
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
      params.showDPO,
      params.period,
    ].join('|')
  }

  return {
    name: `dpo_${paneId}`,
    version: '2.1.0',
    description: 'DPO 去趋势价格振荡器渲染器（WebGL + Canvas2D 回退）',
    debugName: 'DPO',
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

    /** 绘制 DPO 零轴和主折线。 */
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<DPORenderState>(stateKey)
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

      const drawStart = Math.max(range.start, params.period - 1)
      const drawEnd = Math.min(range.end, series.length)
      const cacheKey = buildDPOCacheKey(range, kLineCenters, pane, params, state.timestamp)

      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedDPOPoints = []
        const invRange = paneHeight / displayValueRange
        const rangeStart = range.start

        if (params.showDPO) {
          for (let i = drawStart; i < drawEnd; i++) {
            const value = series[i]
            if (value === undefined) continue
            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue
            cachedDPOPoints.push({ x: centerX, y: paneHeight - (value - displayMin) * invRange })
          }
        }
      }

      const lines =
        params.showDPO && cachedDPOPoints.length >= 2
          ? [{ points: cachedDPOPoints, width: 1, color: colors.palette.i5 }]
          : []
      if (!tryDrawLinesGpu(context, lines, scrollLeft)) {
        drawDPOLineWithCanvas2D(ctx, scrollLeft, cachedDPOPoints, params.showDPO, colors.palette.i5)
      }
    },

    /** 返回当前 DPO 配置。 */
    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<DPORenderState>(stateKey)
      return state?.params ?? {}
    },

    /** 配置由 IndicatorScheduler 统一更新。 */
    setConfig() {},
  }
}

/**
 * 使用 Canvas2D 绘制 DPO 折线。
 * @param ctx 目标 Canvas2D 上下文。
 * @param scrollLeft 当前横向滚动偏移。
 * @param points 折线点集合。
 * @param showDPO 是否显示指标线。
 * @param lineColor 指标线颜色。
 */
function drawDPOLineWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  points: LinePoint[],
  showDPO: boolean,
  lineColor: string,
): void {
  if (!showDPO || points.length < 2) return

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

const getDPOTitleInfo = createSingleLineTitleInfo({
  createStateKey: createDPOStateKey,
  name: 'DPO',
  defaultPeriod: 20,
  getColor: (colors) => colors.palette.i5,
})

@Indicator({
  name: 'dpo',
  displayName: 'DPO',
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_DPO',
  scaleRendererFactory: createDpoScaleRendererPlugin,
  visibleState: { compose: createPaddedSparseVisibleStateComposer('dpo', EMPTY_DPO_STATE) },
  getTitleInfo: getDPOTitleInfo,
  runtime: {
    defaultConfig: { period: 20, showDPO: true },
    computeKey: 'calcDPOData',
    compute: (data: KLineData[], c: DPORenderState['params']) => calcDPOData(data, c.period),
  },
})
export class DPOIndicatorDefinition {
  static rendererFactory = createDPORendererPlugin
}
