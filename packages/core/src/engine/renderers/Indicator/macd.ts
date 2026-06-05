import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../../plugin'
import { RENDERER_PRIORITY } from '../../../plugin'
import type { KLineData } from '../../../types/price'
import { resolveThemeColors } from '../../../tokens'
import { alignToPhysicalPixelCenter } from '../../draw/pixelAlign'
import type { MACDRenderState } from '../../indicators/macdState'
import { createMACDStateKey } from '../../indicators/macdState'
import type { MACDPoint } from '../../indicators/calculators'
import { calcMACDData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'

type LinePoint = { x: number; y: number }

export interface MACDConfig {
  /** 快线周期（默认 12） */
  fastPeriod?: number
  /** 慢线周期（默认 26） */
  slowPeriod?: number
  /** DEA 周期（默认 9） */
  signalPeriod?: number
  /** 是否显示 DIF 线 */
  showDIF?: boolean
  /** 是否显示 DEA 线 */
  showDEA?: boolean
  /** 是否显示 MACD 柱 */
  showBAR?: boolean
}

export interface MACDRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
  /** 初始配置 */
  config?: MACDConfig
}

function getMACDStateKey(host: PluginHost | null, paneId: string): string | null {
    const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
    if (!scheduler) {
        console.warn('[MACDRenderer] Scheduler not available via service locator')
        return null
    }
    const meta = scheduler.getIndicatorMetadata('macd')
    if (!meta) {
        console.warn("[MACDRenderer] Indicator metadata for 'macd' not found, skip rendering")
        return null
    }
    return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 MACD 渲染器插件
 * 从 StateStore 读取 MACD 状态，不再内联计算
 */
export function createMACDRendererPlugin(options: MACDRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub', config: initialConfig = {} } = options

  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getMACDStateKey(pluginHost, paneId)
  }

  const config: Required<MACDConfig> = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    showDIF: true,
    showDEA: true,
    showBAR: true,
    ...initialConfig,
  }

  // 线条点缓存（用于 WebGL/Canvas2D 渲染）
  let cachedLineKey = ''
  let cachedDifPoints: LinePoint[] = []
  let cachedDeaPoints: LinePoint[] = []

  function clearLineCache() {
    cachedLineKey = ''
    cachedDifPoints = []
    cachedDeaPoints = []
  }

  // 构建线条缓存 key
  function buildLineCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    displayMin: number,
    displayMax: number,
    stateTimestamp: number
  ): string {
    const dr = pane.yAxis.getDisplayRange()
    return [
      stateTimestamp,
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      displayMax.toFixed(6),
      displayMin.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      config.showDIF,
      config.showDEA,
    ].join('|')
  }

  return {
    name: `macd_${paneId}`,
    version: '1.0.0',
    description: 'MACD 指标渲染器',
    debugName: 'MACD',
    paneId: paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
      const klineData = data as KLineData[]
      const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)

      // 从 StateStore 读取 MACD 状态
      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<MACDRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax) return
      if (klineData.length < config.slowPeriod) return

      const macdData = state.series
      if (!macdData || macdData.length === 0) return

      // 使用 state 中的极值，或回退到计算
      let valueMin = state.visibleMin
      let valueMax = state.visibleMax

      // 添加 padding
      const padding = Math.max(0.05, (valueMax - valueMin) * 0.1)
      valueMin = valueMin - padding
      valueMax = valueMax + padding
      const valueRange = valueMax - valueMin || 1

      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      // 零轴位置
      const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

      const drawStart = Math.max(range.start, config.slowPeriod - 1)
      const drawEnd = Math.min(range.end, klineData.length)

      // 绘制 MACD 柱状图（WebGL 优先）
      if (config.showBAR) {
        const alignedZeroY = Math.round(zeroY * dpr) / dpr

        const maxBars = Math.max(1, drawEnd - drawStart)
        const barUpBuf = new Float32Array(maxBars * 4)
        const barUpLightBuf = new Float32Array(maxBars * 4)
        const barDownBuf = new Float32Array(maxBars * 4)
        const barDownLightBuf = new Float32Array(maxBars * 4)
        let barUpCount = 0, barUpLightCount = 0, barDownCount = 0, barDownLightCount = 0

        for (let i = drawStart; i < drawEnd; i++) {
          const point = macdData[i]
          if (!point) continue

          const barRect = context.kBarRects[i - range.start]
          if (!barRect) continue

          const barY = pane.height - (point.macd - displayMin) / displayValueRange * pane.height
          const isPositive = point.macd >= 0

          const prevPoint = i > 0 ? macdData[i - 1] : null
          const isRising = prevPoint ? point.macd >= prevPoint.macd : true

          const alignedBarY = Math.round(barY * dpr) / dpr
          const minBarHPx = 1 / dpr

          let buf: Float32Array
          let idx: number

          if (isPositive) {
            const rawH = alignedZeroY - alignedBarY
            const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
            const finalBarY = rawH <= 0 ? alignedZeroY - minBarHPx : alignedZeroY - finalH
            if (isRising) { buf = barUpBuf; idx = barUpCount++ }
            else { buf = barUpLightBuf; idx = barUpLightCount++ }
            const off = idx * 4
            buf[off] = barRect.x; buf[off + 1] = finalBarY; buf[off + 2] = barRect.width; buf[off + 3] = finalH
          } else {
            const rawH = alignedBarY - alignedZeroY
            const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
            if (isRising) { buf = barDownLightBuf; idx = barDownLightCount++ }
            else { buf = barDownBuf; idx = barDownCount++ }
            const off = idx * 4
            buf[off] = barRect.x; buf[off + 1] = alignedZeroY; buf[off + 2] = barRect.width; buf[off + 3] = finalH
          }
        }

        const usedWebGL = drawMacdBarsWithWebGL(context, barUpBuf, barUpCount, barUpLightBuf, barUpLightCount, barDownBuf, barDownCount, barDownLightBuf, barDownLightCount)
        if (!usedWebGL) {
          drawMacdBarsWithCanvas2D(ctx, scrollLeft, colors.macd.barUp, colors.macd.barUpLight, colors.macd.barDown, colors.macd.barDownLight, barUpBuf, barUpCount, barUpLightBuf, barUpLightCount, barDownBuf, barDownCount, barDownLightBuf, barDownLightCount)
        } else {
          compositeMacdWebGL(ctx, context)
        }
      }

      // 更新线条点缓存
      const lineCacheKey = buildLineCacheKey(range, kLineCenters, pane, displayMin, displayMax, state.timestamp)
      if (cachedLineKey !== lineCacheKey) {
        cachedLineKey = lineCacheKey
        cachedDifPoints = []
        cachedDeaPoints = []

        if (config.showDIF) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = macdData[i]
            if (!point) continue
            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue
            const logicY = pane.height - (point.dif - displayMin) / displayValueRange * pane.height
            cachedDifPoints.push({ x: centerX, y: logicY })
          }
        }

        if (config.showDEA) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = macdData[i]
            if (!point) continue
            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue
            const logicY = pane.height - (point.dea - displayMin) / displayValueRange * pane.height
            cachedDeaPoints.push({ x: centerX, y: logicY })
          }
        }
      }

      // 绘制 DIF/DEA 线（WebGL 优先，Canvas2D 回退）
      const enableWebGL = context.settings?.enableWebGLRendering !== false
      let usedWebGLForLines = false
      if (enableWebGL && lineWebGLSurface?.isAvailable()) {
        const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
        if (config.showDIF && cachedDifPoints.length >= 2) {
          lines.push({ points: cachedDifPoints, width: 1, color: colors.macd.dif })
        }
        if (config.showDEA && cachedDeaPoints.length >= 2) {
          lines.push({ points: cachedDeaPoints, width: 1, color: colors.macd.dea })
        }
        const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)
        if (allOk) {
          usedWebGLForLines = true
          lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
        }
      }

      if (!usedWebGLForLines) {
        drawMacdLinesWithCanvas2D(ctx, scrollLeft, colors.macd.dif, colors.macd.dea, cachedDifPoints, cachedDeaPoints, config)
      }
    },

    onDataUpdate() {
      clearLineCache()
    },

    getConfig() {
      return { ...config }
    },

    setConfig(newConfig: Record<string, unknown>) {
      let needClearLineCache = false
      if ('fastPeriod' in newConfig && newConfig.fastPeriod !== config.fastPeriod) {
        clearLineCache()
      }
      if ('slowPeriod' in newConfig && newConfig.slowPeriod !== config.slowPeriod) {
        clearLineCache()
      }
      if ('signalPeriod' in newConfig && newConfig.signalPeriod !== config.signalPeriod) {
        clearLineCache()
      }
      if ('showDIF' in newConfig && newConfig.showDIF !== config.showDIF) {
        needClearLineCache = true
      }
      if ('showDEA' in newConfig && newConfig.showDEA !== config.showDEA) {
        needClearLineCache = true
      }
      Object.assign(config, newConfig)
      if (needClearLineCache) {
        clearLineCache()
      }
    },
  }
}

function drawMacdBarsWithWebGL(
  context: RenderContext,
  barUpBuf: Float32Array, barUpCount: number,
  barUpLightBuf: Float32Array, barUpLightCount: number,
  barDownBuf: Float32Array, barDownCount: number,
  barDownLightBuf: Float32Array, barDownLightCount: number
): boolean {
  const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
  if (context.settings?.enableWebGLRendering === false) return false
  const surface = context.candleWebGLSurface
  if (!surface || !surface.isAvailable()) return false

  surface.clear()

  const ok1 = barUpCount === 0 || surface.drawRectBuffer(barUpBuf.subarray(0, barUpCount * 4), barUpCount, colors.macd.barUp, context.scrollLeft)
  const ok2 = barUpLightCount === 0 || surface.drawRectBuffer(barUpLightBuf.subarray(0, barUpLightCount * 4), barUpLightCount, colors.macd.barUpLight, context.scrollLeft)
  const ok3 = barDownCount === 0 || surface.drawRectBuffer(barDownBuf.subarray(0, barDownCount * 4), barDownCount, colors.macd.barDown, context.scrollLeft)
  const ok4 = barDownLightCount === 0 || surface.drawRectBuffer(barDownLightBuf.subarray(0, barDownLightCount * 4), barDownLightCount, colors.macd.barDownLight, context.scrollLeft)

  return ok1 && ok2 && ok3 && ok4
}

function drawMacdBarsWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  barUpColor: string, barUpLightColor: string,
  barDownColor: string, barDownLightColor: string,
  barUpBuf: Float32Array, barUpCount: number,
  barUpLightBuf: Float32Array, barUpLightCount: number,
  barDownBuf: Float32Array, barDownCount: number,
  barDownLightBuf: Float32Array, barDownLightCount: number
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)

  ctx.fillStyle = barUpColor
  for (let i = 0; i < barUpCount; i++) {
    const off = i * 4
    ctx.fillRect(barUpBuf[off], barUpBuf[off + 1], barUpBuf[off + 2], barUpBuf[off + 3])
  }

  ctx.fillStyle = barUpLightColor
  for (let i = 0; i < barUpLightCount; i++) {
    const off = i * 4
    ctx.fillRect(barUpLightBuf[off], barUpLightBuf[off + 1], barUpLightBuf[off + 2], barUpLightBuf[off + 3])
  }

  ctx.fillStyle = barDownColor
  for (let i = 0; i < barDownCount; i++) {
    const off = i * 4
    ctx.fillRect(barDownBuf[off], barDownBuf[off + 1], barDownBuf[off + 2], barDownBuf[off + 3])
  }

  ctx.fillStyle = barDownLightColor
  for (let i = 0; i < barDownLightCount; i++) {
    const off = i * 4
    ctx.fillRect(barDownLightBuf[off], barDownLightBuf[off + 1], barDownLightBuf[off + 2], barDownLightBuf[off + 3])
  }

  ctx.restore()
}

function drawMacdLinesWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  difColor: string,
  deaColor: string,
  difPoints: LinePoint[],
  deaPoints: LinePoint[],
  config: { showDIF: boolean; showDEA: boolean }
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (config.showDIF && difPoints.length >= 2) {
    ctx.strokeStyle = difColor
    ctx.beginPath()
    ctx.moveTo(difPoints[0]!.x, difPoints[0]!.y)
    for (let i = 1; i < difPoints.length; i++) {
      const point = difPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (config.showDEA && deaPoints.length >= 2) {
    ctx.strokeStyle = deaColor
    ctx.beginPath()
    ctx.moveTo(deaPoints[0]!.x, deaPoints[0]!.y)
    for (let i = 1; i < deaPoints.length; i++) {
      const point = deaPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

function compositeMacdWebGL(ctx: CanvasRenderingContext2D, context: RenderContext): void {
  const surface = context.candleWebGLSurface
  if (!surface) return

  surface.compositeTo(ctx)
}

/**
 * 计算指定索引处的 MACD 值（供图例使用）
 * 使用 calculators.ts 中的计算函数
 */
export function calcMACDAtIndex(
  data: KLineData[],
  index: number,
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: number; dea: number; macd: number } | null {
  if (index < slowPeriod || index >= data.length) return null

  const macdData = calcMACDData(data, fastPeriod, slowPeriod, signalPeriod)
  return macdData[index] ?? null
}

/**
 * 获取 MACD 标题信息（供 paneTitle 使用）
 * 从 pluginHost 获取已计算好的数据，避免重复计算
 */
export function getMACDTitleInfo(
  index: number,
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
  pluginHost: PluginHost,
  paneId: string = 'sub_MACD',
  theme: 'light' | 'dark' = 'light',
  isAsiaMarket?: boolean
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
  const colors = resolveThemeColors(theme, isAsiaMarket)
  const state = pluginHost.getSharedState<MACDRenderState>(createMACDStateKey(paneId))
  if (!state) return null

  const point = state.series[index]
  if (!point) return null

  return {
    name: 'MACD',
    params: [fastPeriod, slowPeriod, signalPeriod],
    values: [
      { label: 'DIF', value: point.dif, color: colors.macd.dif },
      { label: 'DEA', value: point.dea, color: colors.macd.dea },
      { label: 'MACD', value: point.macd, color: point.macd >= 0 ? colors.macd.barUp : colors.macd.barDown },
    ],
  }
}

@Indicator({
  name: 'macd',
  displayName: 'MACD',
  category: 'oscillator',
  stateKey: createMACDStateKey,
  defaultPaneId: 'sub_MACD',
  paneIdField: 'macdPaneId',
  applyResult: (host, state, paneId) => {
    host.setSharedState(createMACDStateKey(paneId), state as any, 'indicator_scheduler')
  },
})
class MACDIndicatorDefinition {
  static rendererFactory = createMACDRendererPlugin
}
