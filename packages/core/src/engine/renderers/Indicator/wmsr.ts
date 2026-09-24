import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { alignToPhysicalPixelCenter } from '@/foundation/utils/pixelAlign.js'
import { calcWMSRData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { WMSRRenderState } from '../../indicators/state/wmsrState.js'
import { EMPTY_WMSR_STATE } from '../../indicators/state/wmsrState.js'
import { createFixedRangeSparseVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'
import { createWmsrScaleRendererPlugin } from './scale/wmsr_scale.js'
import { createSingleLineTitleInfo } from './shared/titleInfo.js'

type LinePoint = { x: number; y: number }

interface WMSRRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
  /** 指标实例 ID，渲染状态寻址唯一键。 */
  instanceId?: string
}

/**
 * 创建 WMSR 渲染器插件
 */
function createWMSRRendererPlugin(options: WMSRRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub', instanceId } = options
  let pluginHost: PluginHost | null = null

  // 线条点缓存
  let cachedKey = ''
  let cachedWMSRPoints: LinePoint[] = []

  // 离屏 Canvas 缓存虚线背景线 (-20 / -50 / -80)
  let offscreenCanvas: HTMLCanvasElement | null = null
  let offscreenCtx: CanvasRenderingContext2D | null = null
  let cachedDashedLinesKey = ''

  function clearLineCache() {
    cachedKey = ''
    cachedWMSRPoints = []
  }

  function getOffscreenCanvas(
    width: number,
    height: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas = document.createElement('canvas')
      offscreenCanvas.width = width
      offscreenCanvas.height = height
      offscreenCtx = offscreenCanvas.getContext('2d')!
      cachedDashedLinesKey = ''
    }
    return { canvas: offscreenCanvas, ctx: offscreenCtx! }
  }

  function buildDashedLinesKey(
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
  ): string {
    return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}`
  }

  function renderDashedLinesToOffscreen(
    ctx: CanvasRenderingContext2D,
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    colors: { wmsr: { overbought: string; oversold: string; guide: string } },
  ): void {
    const displayValueRange = displayMax - displayMin || 1
    const y20 = alignToPhysicalPixelCenter(
      paneHeight - ((-20 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )
    const y80 = alignToPhysicalPixelCenter(
      paneHeight - ((-80 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )
    const y50 = alignToPhysicalPixelCenter(
      paneHeight - ((-50 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    ctx.strokeStyle = colors.wmsr.overbought
    ctx.beginPath()
    ctx.moveTo(0, y20)
    ctx.lineTo(paneWidth, y20)
    ctx.stroke()

    ctx.strokeStyle = colors.wmsr.oversold
    ctx.beginPath()
    ctx.moveTo(0, y80)
    ctx.lineTo(paneWidth, y80)
    ctx.stroke()

    ctx.strokeStyle = colors.wmsr.guide
    ctx.beginPath()
    ctx.moveTo(0, y50)
    ctx.lineTo(paneWidth, y50)
    ctx.stroke()

    ctx.restore()
  }

  function buildWMSRCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    params: WMSRRenderState['params'],
    stateTimestamp: number,
  ): string {
    const dr = pane.yAxis.getDisplayRange()
    return [
      stateTimestamp,
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      dr.maxPrice.toFixed(6),
      dr.minPrice.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      params.showWMSR,
      params.period,
    ].join('|')
  }

  return {
    name: `wmsr_${paneId}`,
    version: '2.1.0',
    description: 'WMSR 威廉指标渲染器（WebGL + Canvas2D 回退）',
    debugName: 'WMSR',
    paneId: paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      return instanceId ? [instanceId] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      if (!instanceId) return
      const state = context.indicatorStateReader?.get<WMSRRenderState>(instanceId)
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
      const dashedLinesKey = buildDashedLinesKey(paneWidth, paneHeight, displayMin, displayMax, dpr)

      if (cachedDashedLinesKey !== dashedLinesKey) {
        cachedDashedLinesKey = dashedLinesKey
        const { ctx: offCtx } = getOffscreenCanvas(
          Math.ceil(paneWidth * dpr),
          Math.ceil(paneHeight * dpr),
        )
        renderDashedLinesToOffscreen(
          offCtx,
          paneWidth,
          paneHeight,
          displayMin,
          displayMax,
          dpr,
          colors,
        )
      }

      if (offscreenCanvas) {
        ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)
      }

      // 确定绘制范围
      const drawStart = Math.max(range.start, params.period - 1)
      const drawEnd = Math.min(range.end, series.length)

      // 更新线条缓存
      const cacheKey = buildWMSRCacheKey(range, kLineCenters, pane, params, state.timestamp)
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey

        const paneH = paneHeight
        const invRange = paneH / displayValueRange
        const rangeStart = range.start

        if (params.showWMSR) {
          const points: LinePoint[] = []
          for (let i = drawStart; i < drawEnd; i++) {
            const value = series[i]
            if (value === undefined) continue

            const centerX = kLineCenters[i - rangeStart]
            if (centerX === undefined) continue

            points.push({ x: centerX, y: paneH - (value - displayMin) * invRange })
          }
          cachedWMSRPoints = points
        } else {
          cachedWMSRPoints = []
        }
      }

      // 绘制 WMSR 线（WebGL 优先，Canvas2D 回退）
      const wmsrLines =
        params.showWMSR && cachedWMSRPoints.length >= 2
          ? [{ points: cachedWMSRPoints, width: 1, color: colors.wmsr.wmsr }]
          : []
      if (!tryDrawLinesGpu(context, wmsrLines, scrollLeft)) {
        drawWMSRLineWithCanvas2D(ctx, scrollLeft, cachedWMSRPoints, params, colors)
      }
    },

    getConfig() {
      if (!instanceId) return {}
      const state = pluginHost
        ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
        ?.get<WMSRRenderState>(instanceId)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op：配置由外部统一更新
    },
  }
}

/**
 * 使用 Canvas 2D 绘制 WMSR 线（WebGL 回退）
 */
function drawWMSRLineWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  wmsrPoints: LinePoint[],
  params: { showWMSR: boolean },
  colors: { wmsr: { wmsr: string } },
): void {
  if (!params.showWMSR || wmsrPoints.length < 2) return

  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.strokeStyle = colors.wmsr.wmsr
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(wmsrPoints[0]!.x, wmsrPoints[0]!.y)
  for (let i = 1; i < wmsrPoints.length; i++) {
    const point = wmsrPoints[i]!
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
  ctx.restore()
}

const getWMSRTitleInfo = createSingleLineTitleInfo({
  name: 'WMSR',
  defaultPeriod: 14,
  getColor: (colors) => colors.wmsr.wmsr,
})

@Indicator({
  name: 'wmsr',
  displayName: 'WMSR',
  kind: IndicatorKind.Indicator,
  category: 'oscillator',
  indicatorType: 'momentum',
  defaultPaneId: 'sub_WMSR',
  visibleState: { compose: createFixedRangeSparseVisibleStateComposer('wmsr', EMPTY_WMSR_STATE) },
  scaleRendererFactory: createWmsrScaleRendererPlugin,
  getTitleInfo: getWMSRTitleInfo,
  presentation: { defaultOptions: { showWMSR: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcWMSRData',
    compute: (data, c) => calcWMSRData(data, c.period),
  },
})
export class WMSRIndicatorDefinition {
  static rendererFactory = createWMSRRendererPlugin
}
