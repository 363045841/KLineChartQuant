/**
 * T3 主图单线渲染器
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
import { calcT3Data } from '../../indicators/calculators/t3'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { T3RenderState } from '../../indicators/state/t3State'
import { createT3StateKey, EMPTY_T3_STATE } from '../../indicators/state/t3State'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

type Point = { x: number; y: number }

interface T3RendererOptions {
  paneId?: string
}

/** 解析当前 pane 的 T3 共享状态 key。 */
function getT3StateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[T3Renderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('t3')
  if (!meta) {
    console.warn("[T3Renderer] Indicator metadata for 't3' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/** 创建 T3 主图单线渲染插件。 */
function createT3RendererPlugin(options: T3RendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  /** 获取当前渲染实例对应的状态 key。 */
  function resolveKey(): string | null {
    return getT3StateKey(pluginHost, paneId)
  }

  return {
    name: `t3_${paneId}`,
    version: '1.1.0',
    description: 'T3 Tillson 平滑移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'T3',
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

    // 将可见 T3 序列转换为屏幕折线并优先提交给 GPU。
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = context.indicatorStateReader?.get<T3RenderState>(stateKey)
      if (!state || !state.params.showT3 || state.visibleMin > state.visibleMax) return

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

      if (tryDrawLinesGpu(context, [{ points, width: 1, color: colors.palette.i3 }], scrollLeft))
        return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = colors.palette.i3
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
        .get<T3RenderState>(stateKey)
      return state?.params ?? {}
    },

    // 指标配置由调度器统一更新，渲染器不直接写状态。
    setConfig() {
      // no-op
    },
  }
}

const getT3TitleInfo = createSingleLineTitleInfo({
  createStateKey: createT3StateKey,
  name: 'T3',
  getParams: (p) => [p.period as number, p.volumeFactor as number],
  getColor: (colors) => colors.palette.i3,
})

@Indicator({
  name: 't3',
  displayName: 't3',
  getTitleInfo: getT3TitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 't3_main',
    toActiveConfig: (params, active) => ({ ...params, showT3: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('t3', EMPTY_T3_STATE) },
  scale: { indicatorKey: 't3', label: 'T3', decimals: 2 },
  presentation: { defaultOptions: { showT3: true } },
  runtime: {
    defaultParams: { period: 5, volumeFactor: 0.7 },
    computeKey: 'calcT3Data',
    compute: (data: KLineData[], c) => calcT3Data(data, c.period, c.volumeFactor),
  },
})
export class T3Definition {
  static rendererFactory = createT3RendererPlugin
}
