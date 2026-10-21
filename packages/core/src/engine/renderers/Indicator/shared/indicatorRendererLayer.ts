/**
 * 指标渲染器 Layer 接缝。
 *
 * 指标工厂只声明身份（definitionId / paneId / z / role / kind）与绘制闭包；`Layer` 的
 * 通用样板（id 生成、role 推导、可见性、sceneRenderer 注入、dispose）集中在此，
 * 避免每个指标渲染器重复实现，符合单一事实来源。
 */

import { resolveIndicatorLayerId } from '@/engine/indicators/indicatorLayerNaming.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { PrimitiveRenderContext, RenderContext } from '@/foundation/plugin/index.js'
import type { DrawListLayer, Layer, LayerRole } from '@/rendering/scene/types.js'
/** 两种 Layer 共用的身份声明。 */
type IndicatorRendererLayerIdentity = {
  /** 绘制目标 pane，具体 paneId。 */
  paneId: string
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
  kind?: 'context'
  draw: (context: RenderContext) => void
}

/** 组装指标 Layer 所需参数。 */
export type IndicatorRendererLayerSpec =
  | IndicatorDrawListLayerSpec
  | IndicatorContextLayerSpec

/** 无资源需释放的 Layer 的缺省 dispose。 */
function noopDispose(): void {}

/** 身份与生命周期字段，两种 Layer 共用。 */
function base(spec: IndicatorRendererLayerSpec): Layer<RenderContext> {
  const identity = {
    id:
      'definitionId' in spec
        ? resolveIndicatorLayerId(spec.definitionId, spec.paneId, spec.part)
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
      paint: (context) => spec.draw(context),
    }
  }
  return {
    ...identity,
    kind: 'context',
    paint: (context) => spec.draw(context),
  }
}

/** 组装指标 Layer：kind 决定合成边界，其余样板集中在此。 */
export function createIndicatorRendererLayer(
  spec: IndicatorRendererLayerSpec,
): Layer<RenderContext> {
  return base(spec)
}
