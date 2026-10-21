/**
 * 指标渲染器 Layer 接缝。
 *
 * 指标工厂只声明身份（definitionId / paneId / z / role）与绘制闭包；`Layer` 的
 * 通用样板（id 生成、role 推导、可见性、sceneRenderer 注入、dispose）集中在此，
 * 避免每个指标渲染器重复实现，符合单一事实来源。
 */

import { resolveIndicatorLayerId } from '@/engine/indicators/indicatorLayerNaming.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer, LayerRole } from '@/rendering/scene/types.js'

/** 组装指标 Layer 所需参数。 */
export type IndicatorRendererLayerSpec = {
  /** 绘制目标 pane，具体 paneId。 */
  paneId: string
  /** 叠放优先级，取 RENDERER_PRIORITY.*。 */
  z: number
  /** 显式 role；缺省按 pane 推导。 */
  role?: LayerRole
  /** 只输出公共原语且不改目标状态；声明后可与相邻图层合并成一次合成。 */
  primitiveOnly?: boolean
  /** 绘制体，等价旧 plugin.draw。 */
  draw: (context: RenderContext) => void
  /** 卸载清理；缺省无操作。 */
  dispose?: () => void
} & ({ definitionId: string; part?: 'renderer' | 'scale' } | { layerId: string })

/** 无资源需释放的 Layer 的缺省 dispose。 */
function noopDispose(): void {}

/** 组装指标 Layer：集中处理 id / role / pane / z / 可见性与绘制分发。 */
export function createIndicatorRendererLayer(
  spec: IndicatorRendererLayerSpec,
): Layer<RenderContext> {
  return {
    id:
      'definitionId' in spec
        ? resolveIndicatorLayerId(spec.definitionId, spec.paneId, spec.part)
        : spec.layerId,
    role: spec.role ?? (spec.paneId === MAIN_PANE_ID ? 'primary' : 'indicator'),
    pane: spec.paneId,
    z: spec.z,
    visible: true,
    primitiveOnly: spec.primitiveOnly === true,
    paint(context) {
      spec.draw(context)
    },
    dispose: spec.dispose ?? noopDispose,
  }
}
