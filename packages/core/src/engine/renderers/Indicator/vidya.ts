/**
 * VIDYA 主图单线渲染器
 * 使用 GPU 折线渲染并在不可用时回退到 Canvas2D。
 */
import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import type { KLineData } from '../../../foundation/types/price'
import { calcVIDYAData } from '../../indicators/calculators/vidya'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { VIDYARenderState } from '../../indicators/state/vidyaState'
import { createVIDYAStateKey, EMPTY_VIDYA_STATE } from '../../indicators/state/vidyaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface VIDYARendererOptions {
  paneId?: string
}

/** 解析当前 pane 的 VIDYA 共享状态 key。 */
function getVIDYAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[VIDYARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('vidya')
  if (!meta) {
    console.warn("[VIDYARenderer] Indicator metadata for 'vidya' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/** 创建 VIDYA 主图单线渲染插件。 */
function createVIDYARendererPlugin(options: VIDYARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  /** 获取当前渲染实例对应的状态 key。 */
  function resolveKey(): string | null {
    return getVIDYAStateKey(pluginHost, paneId)
  }

  return {
    name: `vidya_${paneId}`,
    version: '1.1.0',
    description: 'VIDYA 可变指数动态均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'VIDYA',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    // 安装时保存插件宿主，以读取指标共享状态。
    onInstall(host: PluginHost) {
      pluginHost = host
    },

    // 声明本渲染器会读取的共享状态命名空间。
    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    // 将可见 VIDYA 序列转换为屏幕折线并优先提交给 GPU。
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<VIDYARenderState>(stateKey)
      if (!state || !state.params.showVIDYA || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i4 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i4
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

    // 返回当前指标参数供配置系统读取。
    getConfig() {
      const stateKey = resolveKey()
      if (!stateKey) return {}
      const state = pluginHost
        ?.getService<IndicatorScheduler>('indicatorScheduler')
        ?.createRenderStateReader()
        .get<VIDYARenderState>(stateKey)
      return state?.params ?? {}
    },

    // 指标配置由调度器统一更新，渲染器不直接写状态。
    setConfig() {
      // no-op
    },
  }
}

const getVIDYATitleInfo = createSingleLineTitleInfo({
  createStateKey: createVIDYAStateKey,
  name: 'VIDYA',
  getParams: (p) => [p.period as number, p.cmoPeriod as number],
  getColor: (colors) => colors.palette.i4,
})

@Indicator({
  name: 'vidya',
  displayName: 'vidya',
  getTitleInfo: getVIDYATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'vidya_main',
    toActiveConfig: (params, active) => ({ ...params, showVIDYA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('vidya', EMPTY_VIDYA_STATE) },
  scale: { indicatorKey: 'vidya', label: 'VIDYA', decimals: 2 },
  presentation: { defaultOptions: { showVIDYA: true } },
  runtime: {
    defaultParams: { period: 14, cmoPeriod: 9 },
    computeKey: 'calcVIDYAData',
    compute: (data: KLineData[], c) => calcVIDYAData(data, c.period, c.cmoPeriod),
  },
})
export class VIDYADefinition {
  static rendererFactory = createVIDYARendererPlugin
}
