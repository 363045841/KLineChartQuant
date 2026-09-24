import type {
  IndicatorRenderStateReader,
  PluginHost,
  RenderContext,
  RendererPluginWithHost,
} from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { calcFibData } from '../../indicators/calculators/index.js'
import { Indicator } from '../../indicators/indicatorDefinitionRegistry.js'
import {
  type GetTitleInfoFn,
  IndicatorKind,
  type TitleInfo,
  type TitleValueItem,
} from '../../indicators/indicatorMetadata.js'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '../../indicators/instances/api/indicatorRenderBinding.js'
import type { FibRenderState } from '../../indicators/state/fibState.js'
import { EMPTY_FIB_STATE } from '../../indicators/state/fibState.js'
import { createExactRangePointVisibleStateComposer } from '../../indicators/visibleStateComposers.js'
import { tryDrawLinesGpu } from '../linesViaRenderer.js'

/** 构建斐波那契回撤线颜色映射：palette 索引 + token 色组，draw/title 共用同一来源 */
function getFibColors(colors: ColorTokens) {
  return {
    high: colors.palette.i10,
    low: colors.palette.i10,
    l236: colors.palette.i2,
    l382: colors.palette.i2,
    l500: colors.palette.i2,
    l618: colors.fib.l618,
    l786: colors.fib.l786,
  }
}

type Point = { x: number; y: number }

function createFibRendererPlugin(
  options: {
    paneId?: string
    /** 指标实例 ID，渲染状态寻址唯一键。 */
    instanceId?: string
  } = {},
): RendererPluginWithHost {
  const { paneId = 'main', instanceId } = options
  let pluginHost: PluginHost | null = null

  return {
    name: `fib_${paneId}`,
    version: '1.1.0',
    description: '斐波那契回撤线渲染器（WebGL + Canvas2D 回退）',
    debugName: 'Fib',
    paneId,
    priority: RENDERER_PRIORITY.INDICATOR,
    onInstall(host) {
      pluginHost = host
    },
    getDeclaredNamespaces() {
      return instanceId ? [instanceId] : []
    },
    draw(context: RenderContext) {
      const { ctx, pane, range, scrollLeft, kLineCenters } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (!instanceId) return
      const state = context.indicatorStateReader?.get<FibRenderState>(instanceId)
      if (!state || !state.params.showLevels || state.visibleMin > state.visibleMax) return

      const { series } = state
      const toY = (v: number) => pane.yAxis.priceToY(v)
      const rangeStart = range.start

      const collectors: Record<string, Point[]> = {
        high: [],
        low: [],
        l236: [],
        l382: [],
        l500: [],
        l618: [],
        l786: [],
      }
      const drawEnd = Math.min(range.end, series.length)
      for (let i = range.start; i < drawEnd; i++) {
        const pt = series[i]
        if (!pt) continue
        const centerX = kLineCenters[i - rangeStart]
        if (centerX === undefined) continue
        collectors.high!.push({ x: centerX, y: toY(pt.high) })
        collectors.low!.push({ x: centerX, y: toY(pt.low) })
        collectors.l236!.push({ x: centerX, y: toY(pt.level236) })
        collectors.l382!.push({ x: centerX, y: toY(pt.level382) })
        collectors.l500!.push({ x: centerX, y: toY(pt.level500) })
        collectors.l618!.push({ x: centerX, y: toY(pt.level618) })
        collectors.l786!.push({ x: centerX, y: toY(pt.level786) })
      }

      const fibColors = getFibColors(colors)
      const lines: Array<{ points: Point[]; width: number; color: string }> = []
      for (const [key, pts] of Object.entries(collectors)) {
        if (pts.length >= 2) {
          lines.push({
            points: pts,
            width: 1,
            color: fibColors[key as keyof typeof fibColors],
          })
        }
      }

      if (tryDrawLinesGpu(context, lines, scrollLeft)) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)
      ctx.lineWidth = 1
      for (const [key, pts] of Object.entries(collectors)) {
        drawLine(ctx, pts, fibColors[key as keyof typeof fibColors])
      }
      ctx.restore()
    },
    getConfig() {
      if (!instanceId) return {}
      return (
        pluginHost
          ?.getService<IndicatorRenderStateReader>(INDICATOR_INSTANCE_STATE_SERVICE)
          ?.get<FibRenderState>(instanceId)?.params ?? {}
      )
    },
    setConfig() {},
  }
}

function drawLine(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y)
  ctx.stroke()
}

const getFibTitleInfo: GetTitleInfoFn = (
  _data,
  index,
  _params,
  stateReader,
  instanceId,
  _paneId,
  colors,
) => {
  if (index === null || index < 0) return null

  const state = stateReader.get<FibRenderState>(instanceId)
  if (!state) return null

  const p = state.series[index]
  if (!p) return null

  const fibColors = getFibColors(colors)
  const values: TitleValueItem[] = [
    { label: '236', value: p.level236, color: fibColors.l236 },
    { label: '382', value: p.level382, color: fibColors.l382 },
    { label: '500', value: p.level500, color: fibColors.l500 },
    { label: '618', value: p.level618, color: fibColors.l618 },
    { label: '786', value: p.level786, color: fibColors.l786 },
  ]

  return {
    name: 'Fib',
    params: [state.params.period],
    values,
  }
}

@Indicator({
  name: 'fib',
  displayName: 'Fib',
  kind: IndicatorKind.Indicator,
  getTitleInfo: getFibTitleInfo,
  category: 'main',
  indicatorType: 'support-resistance',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    rendererName: 'fib_main',
    toActiveConfig: (params, active) => ({ ...params, showLevels: active }),
  },
  scale: { indicatorKey: 'fib', label: 'Fib', decimals: 4 },
  visibleState: {
    compose: createExactRangePointVisibleStateComposer('fib', EMPTY_FIB_STATE, ['low', 'high']),
  },
  presentation: { defaultOptions: { showLevels: true } },
  runtime: {
    defaultParams: { period: 50 },
    computeKey: 'calcFibData',
    compute: (data, c) => calcFibData(data, c.period),
  },
})
export class FibDefinition {
  static rendererFactory = createFibRendererPlugin
}
