/**
 * 指标渲染器 Layer 接缝。
 *
 * 指标工厂只声明身份（definitionId / paneId / instanceId / axisId）与绘制闭包；
 * `Layer` 的通用样板集中在此，避免每个指标渲染器重复实现。
 */

import { resolveIndicatorLayerId } from '@/engine/indicators/indicatorLayerNaming.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type {
  PrimitiveRenderContext,
  RenderContext,
  RenderGeometryContext,
} from '@/foundation/plugin/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import type { DrawListLayer, Layer, LayerRole } from '@/rendering/scene/types.js'

/** 两种 Layer 共用的身份声明。 */
type IndicatorRendererLayerIdentity = {
  /** 绘制目标 pane，具体 paneId。 */
  paneId: string
  /** 实例身份；图层命名与多实例唯一性都依赖它。 */
  instanceId?: string
  /** 框架派生的轴身份；绘制时把 pane.yAxis 绑定到该轴。 */
  axisId?: string
  /** 叠放优先级，取 RENDERER_PRIORITY.*。 */
  z: number
  /** 显式 role；缺省按 pane 推导。 */
  role?: LayerRole
  /** 卸载清理；缺省无操作。 */
  dispose?: () => void
} & ({ definitionId: string; part?: 'renderer' | 'scale' } | { layerId: string })

/** 纯增量图层：只能提交原语，可与相邻同类图层合并成一次合成。 */
export type IndicatorDrawListLayerSpec = IndicatorRendererLayerIdentity & {
  kind: 'draw-list'
  draw: (context: PrimitiveRenderContext) => void
}

/** 完整上下文图层：可自带裁剪或直接写 canvas，Scene 在其前后立即合成。 */
export type IndicatorContextLayerSpec = IndicatorRendererLayerIdentity & {
  kind: 'context'
  draw: (context: RenderContext) => void
}

/** 组装指标 Layer 所需参数。 */
export type IndicatorRendererLayerSpec = IndicatorDrawListLayerSpec | IndicatorContextLayerSpec

/** 无资源需释放的 Layer 的缺省 dispose。 */
function noopDispose(): void {}

/** 把上下文的价格轴切换到图层绑定的轴；无轴声明时保持 Pane 主轴。 */
export function bindIndicatorAxis<T extends RenderGeometryContext>(context: T, axisId?: string): T {
  if (!axisId) return context
  const axis = context.pane.axis(axisId)
  const yOffset = axis.priceToY(0)
  const dataTransform =
    context.dataTransform && axis.getScaleType() === ScaleType.Linear
      ? { ...context.dataTransform, yOffset, yScale: axis.priceToY(1) - yOffset }
      : undefined
  return { ...context, pane: { ...context.pane, yAxis: axis }, dataTransform }
}

/** 身份与生命周期字段，两种 Layer 共用。 */
function base(spec: IndicatorRendererLayerSpec): Layer<RenderContext> {
  const identity = {
    id:
      'definitionId' in spec
        ? resolveIndicatorLayerId(spec.definitionId, spec.paneId, spec.part, spec.instanceId)
        : spec.layerId,
    role: spec.role ?? (spec.paneId === MAIN_PANE_ID ? 'primary' : 'indicator'),
    pane: spec.paneId,
    z: spec.z,
    visible: true,
    dispose: spec.dispose ?? noopDispose,
  }
  if (spec.kind === 'draw-list') {
    return {
      ...identity,
      kind: 'draw-list',
      paint: (context) => spec.draw(bindIndicatorAxis(context, spec.axisId)),
    }
  }
  return {
    ...identity,
    kind: 'context',
    paint: (context) => spec.draw(bindIndicatorAxis(context, spec.axisId)),
  }
}

/** 组装指标 Layer：kind 决定合成边界，其余样板集中在此。 */
export function createIndicatorRendererLayer(
  spec: IndicatorRendererLayerSpec,
): Layer<RenderContext> {
  return base(spec)
}
