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
import { calcGMMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { TitleInfo, TitleValueItem } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import {
  EMPTY_GMMA_STATE,
  GMMA_LONG_PERIODS,
  GMMA_SHORT_PERIODS,
  createGMMAStateKey,
  type GMMARenderState,
} from '../../indicators/state/gmmaState'
import { createFixedRangeRecordVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

type LinePoint = { x: number; y: number }

/** 构建 GMMA 周期颜色映射：palette 索引（按色相）+ token 色组，draw/title 共用同一来源 */
function getGMMAColors(colors: ColorTokens): Record<number, string> {
  return {
    3: colors.palette.i2,
    5: colors.palette.i5,
    12: colors.palette.i4,
    15: colors.palette.i8,
    30: colors.palette.i6,
    35: colors.palette.i6,
    40: colors.palette.i9,
    45: colors.palette.i9,
    8: colors.gmma.g8,
    10: colors.gmma.g10,
    50: colors.gmma.g50,
    60: colors.gmma.g60,
  }
}

/**
 * 构建 GMMA 绘制缓存键
 * 视口、缩放、周期列表或时间戳任一变化都会触发重算折线点
 */
function buildGMMACacheKey(
  range: { start: number; end: number },
  kLineCenters: number[],
  pane: RenderContext['pane'],
  enabledPeriods: number[],
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
    enabledPeriods.join(','),
    pane.height.toFixed(2),
  ].join('|')
}

/** 通过调度器获取 GMMA 状态的 StateStore 键名 */
function getGMMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[GMMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('gmma')
  if (!meta) {
    console.warn("[GMMARenderer] Indicator metadata for 'gmma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * GMMA 标题信息：按启用周期取对应 EMA 值
 * 短组用 G{period} 标签、长组用 L{period} 标签，颜色沿用 getGMMAColors 映射
 */
function getGMMATitleInfo(
  _data: KLineData[],
  index: number | null,
  _params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  paneId: string,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null

  const state = stateReader.get<GMMARenderState>(createGMMAStateKey(paneId))
  if (!state || state.visibleMin > state.visibleMax) return null

  const gmmaColors = getGMMAColors(colors)
  const values: TitleValueItem[] = []
  for (const period of state.enabledPeriods) {
    const value = state.series[period]?.[index]
    if (value === undefined) continue

    const isShort = GMMA_SHORT_PERIODS.includes(period as (typeof GMMA_SHORT_PERIODS)[number])
    values.push({
      label: isShort ? `G${period}` : `L${period}`,
      value,
      color: gmmaColors[period] ?? colors.palette.i2,
    })
  }

  return { name: 'GMMA', params: [], values }
}

@Indicator({
  name: 'gmma',
  displayName: 'GMMA',
  getTitleInfo: getGMMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'gmma_main',
    toActiveConfig: (params, active) => ({ ...params, showGMMA: active }),
  },
  visibleState: {
    compose: createFixedRangeRecordVisibleStateComposer('gmma', EMPTY_GMMA_STATE),
  },
  scale: { indicatorKey: 'gmma', label: 'GMMA', decimals: 2 },
  presentation: { defaultOptions: { showGMMA: true } },
  runtime: {
    defaultParams: {},
    computeKey: 'calcGMMAData',
    compute: (data) => calcGMMAData(data),
  },
})
export class GMMADefinition {
  static rendererFactory = createGMMARendererPlugin
}

/** 创建 GMMA 多线渲染器插件（WebGL 优先，失败回退 Canvas2D） */
export function createGMMARendererPlugin(
  options: { paneId?: string } = {},
): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null
  let cachedKey = ''
  let cachedLines = new Map<number, LinePoint[]>()

  function clearCache() {
    cachedKey = ''
    cachedLines = new Map()
  }

  function resolveKey(): string | null {
    return getGMMAStateKey(pluginHost, paneId)
  }

  return {
    name: `gmma_${paneId}`,
    version: '1.0.0',
    description: 'GMMA 顾比移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'GMMA',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    getDeclaredNamespaces(): string[] {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const gmmaColors = getGMMAColors(colors)
      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<GMMARenderState>(stateKey)

      if (!state || !state.params.showGMMA || state.visibleMin > state.visibleMax) {
        clearCache()
        return
      }

      if (state.enabledPeriods.length === 0) {
        clearCache()
        return
      }

      const cacheKey = buildGMMACacheKey(
        range,
        kLineCenters,
        pane,
        state.enabledPeriods,
        state.timestamp,
      )
      if (cachedKey !== cacheKey) {
        cachedKey = cacheKey
        cachedLines = new Map()

        for (const [periodStr, values] of Object.entries(state.series)) {
          const period = Number(periodStr)
          const points: LinePoint[] = []

          for (let i = range.start; i < range.end && i < values.length; i++) {
            const value = values[i]
            if (value === undefined) continue

            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue

            points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
          }

          if (points.length >= 2) {
            cachedLines.set(period, points)
          }
        }
      }

      const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
      for (const period of state.enabledPeriods) {
        const points = cachedLines.get(period)
        if (!points) continue
        lines.push({ points, width: 1, color: gmmaColors[period] ?? colors.palette.i2 })
      }

      // sceneRenderer → fail-closed 2D
      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (const period of state.enabledPeriods) {
        const points = cachedLines.get(period)
        if (!points || points.length < 2) continue
        ctx.strokeStyle = gmmaColors[period] ?? colors.palette.i2
        ctx.beginPath()
        ctx.moveTo(points[0]!.x, points[0]!.y)
        for (let i = 1; i < points.length; i++) {
          const point = points[i]!
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      ctx.restore()
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<GMMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}
