/**
 * SMMA（Wilder 平滑移动平均）单线渲染器，WebGL 优先，Canvas2D 回退
 */

import type {
  RendererPluginWithHost,
  RenderContext,
  PluginHost,
} from '../../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/index'
import { calcSMMAData } from '../../indicators/calculators'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { SMMARenderState } from '../../indicators/state/smmaState'
import { createSMMAStateKey, EMPTY_SMMA_STATE } from '../../indicators/state/smmaState'
import { createSparseVisibleStateComposer } from '../../indicators/visibleStateComposers'
import { tryDrawLinesGpu } from '../linesViaRenderer'

import { createSingleLineTitleInfo } from './shared/titleInfo'

const SMMA_COLOR = '#8b5cf6'

type Point = { x: number; y: number }

interface SMMARendererOptions {
  paneId?: string
}

/**
 * 通过 scheduler 解析指定 pane 的 SMMA 状态 key
 * @param host 插件宿主
 * @param paneId 画布 pane
 * @returns 状态 key；依赖缺失时返回 null
 */
function getSMMAStateKey(host: PluginHost | null, paneId: string): string | null {
  const scheduler = host?.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) {
    console.warn('[SMMARenderer] Scheduler not available via service locator')
    return null
  }
  const meta = scheduler.getIndicatorMetadata('smma')
  if (!meta) {
    console.warn("[SMMARenderer] Indicator metadata for 'smma' not found, skip rendering")
    return null
  }
  return resolveStateKey(meta.stateKey, paneId)
}

/**
 * 创建 SMMA 单线渲染器插件
 * @param options 渲染器选项
 * @returns 渲染器插件
 */
function createSMMARendererPlugin(options: SMMARendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'main' } = options
  let pluginHost: PluginHost | null = null

  function resolveKey(): string | null {
    return getSMMAStateKey(pluginHost, paneId)
  }

  return {
    name: `smma_${paneId}`,
    version: '1.1.0',
    description: 'SMMA Wilder 平滑移动均线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'SMMA',
    paneId,
    priority: RENDERER_PRIORITY.MAIN,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      const key = resolveKey()
      return key ? [key] : []
    },

    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context

      const stateKey = resolveKey()
      if (!stateKey) return
      const state = pluginHost?.getSharedState<SMMARenderState>(stateKey)
      if (!state || !state.params.showSMMA || state.visibleMin > state.visibleMax) return

      const { series } = state
      const drawEnd = Math.min(range.end, series.length)
      const rangeStart = range.start

      // 将可见范围内的有效值映射为折线顶点
      const points: Point[] = []
      for (let i = range.start; i < drawEnd; i++) {
        const value = series[i]
        if (value === undefined) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        points.push({ x: centerX, y: pane.yAxis.priceToY(value) })
      }

      if (points.length < 2) return

      // 优先走 GPU 批量折线，不可用时回退 Canvas2D
      if (tryDrawLinesGpu(context, [{ points, width: 1, color: SMMA_COLOR }], scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.strokeStyle = SMMA_COLOR
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
      const state = pluginHost?.getSharedState<SMMARenderState>(stateKey)
      return state?.params ?? {}
    },

    setConfig() {
      // no-op
    },
  }
}

const getSMMATitleInfo = createSingleLineTitleInfo({
  createStateKey: createSMMAStateKey,
  name: 'SMMA',
  getParams: (p) => [p.period as number],
  color: SMMA_COLOR,
})

@Indicator({
  name: 'smma',
  displayName: 'SMMA',
  getTitleInfo: getSMMATitleInfo,
  category: 'main',
  indicatorType: 'moving-average',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'smma_main',
    toActiveConfig: (params, active) => ({ ...params, showSMMA: active }),
  },
  visibleState: { compose: createSparseVisibleStateComposer('smma', EMPTY_SMMA_STATE) },
  scale: { indicatorKey: 'smma', label: 'SMMA', decimals: 2 },
  runtime: {
    defaultConfig: { period: 14, showSMMA: true },
    computeKey: 'calcSMMAData',
    compute: (data, c) => calcSMMAData(data, c.period),
  },
})
class SMMADefinition {
  static rendererFactory = createSMMARendererPlugin
}
