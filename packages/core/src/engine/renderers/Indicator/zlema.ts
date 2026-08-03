/**
 * ZLEMA（零滞后指数移动平均）单线渲染器
 * 完整骨架与 wma.ts 一致：优先走 WebGL 线段绘制，失败回退 Canvas2D
 */
import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import { calcZLEMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { ZLEMARenderState } from '../../indicators/state/zlemaState'
import { createZLEMAStateKey, EMPTY_ZLEMA_STATE } from '../../indicators/state/zlemaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface ZLEMARendererOptions {
  paneId?: string
}

/**
 * 解析 ZLEMA 渲染状态键
 * 通过服务定位器取 scheduler，再按其元数据解析主图 paneId 对应的 stateKey
 */
function getZLEMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[ZLEMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('zlema')
  if (!meta) {
    console.warn("[ZLEMARenderer] Indicator metadata for 'zlema' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/** 创建 ZLEMA 渲染器插件，draw 时按状态中 showZLEMA 决定是否绘制 */
function createZLEMARendererPlugin(options: ZLEMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getZLEMAStateKey(pluginHost, paneId)
  }

  return {
    name: `zlema_${paneId}`,
    version: '1.1.0',
    description: 'ZLEMA 零滞后指数移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'ZLEMA',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
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

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<ZLEMARenderState>(stateKey)
      if (!state || !state.params.showZLEMA || state.visibleMin > state.visibleMax) return

      const { series } = state
      const drawEnd = Math.min(range.end, series.length)
      const rangeStart = range.start

      const points: Point[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
      }

      if (points.length < 2) return

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i6 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i6
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0]!.x, points[0]!.y)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x, points[i]!.y)
      }
      ctx.stroke()
      ctx.restore()
    },

    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost?.getSharedState<ZLEMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getZLEMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createZLEMAStateKey,
  name: 'ZLEMA',
  getParams: (p) => [p.period as number],
  getColor: (colors) => colors.palette.i6,
})

@Indicator({
  name: 'zlema',
  displayName: 'ZLEMA',
  getTitleInfo: getZLEMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'zlema_main',
    toActiveConfig: (params, active) => ({ ...params, showZLEMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('zlema', EMPTY_ZLEMA_STATE) },
  scale: { indicatorKey: 'zlema', label: 'ZLEMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 14, showZLEMA: true },
    computeKey: 'calcZLEMAData',
    compute: (data, c) => calcZLEMAData(data, c.period),
  },
})
class ZLEMADefinition {
  static rendererFactory = createZLEMARendererPlugin
}
