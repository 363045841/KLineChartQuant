/**
 * 图层可见性投影：把「应显示的活跃图层」与「用户隐藏」合成为 Scene 可见性。
 *
 * 唯一订阅点；字段写入后递增版本，对象树据此重读。
 */

import { effect, type ReadonlySignal, type WritableSignal } from '../../../foundation/reactivity/signal.js'
import type { ActiveRendererDescriptor } from '../../state/chartStateKernel.js'
import type { Scene } from '../../../rendering/scene/types.js'

/** 可见性投影依赖。 */
export interface ChartLayerVisibilityDeps {
  readonly activeRenderers: ReadonlySignal<ReadonlyArray<ActiveRendererDescriptor>>
  /** 读取系统对象状态，使隐藏状态参与同一投影。 */
  readonly systemObjectState: ReadonlySignal<unknown>
  /** 图层是否被用户隐藏。 */
  readonly isLayerHidden: (layerId: string) => boolean
  readonly getScene: () => Scene | null
  readonly bumpRevision: () => void
  readonly scheduleDraw: () => void
}

/** 安装唯一订阅，返回取消函数。 */
export function installLayerVisibilityProjection(deps: ChartLayerVisibilityDeps): () => void {
  let previousLayerIds = new Set<string>()
  return effect(() => {
    const desiredLayerIds = new Set(deps.activeRenderers().map((descriptor) => descriptor.layerId))
    // 系统对象状态参与同一投影，避免视图切换把用户隐藏的对象重新打开。
    deps.systemObjectState()
    const scene = deps.getScene()
    let changed = false
    for (const layerId of new Set([...previousLayerIds, ...desiredLayerIds])) {
      const visible = desiredLayerIds.has(layerId) && !deps.isLayerHidden(layerId)
      const layer = scene?.getLayer(layerId)
      if (scene && layer && layer.visible !== visible) {
        scene.setLayerVisibility(layerId, visible)
        changed = true
      }
    }
    previousLayerIds = desiredLayerIds
    if (!changed) return
    // 可见性字段原地写入后递增版本，对象树才能读到最新值。
    deps.bumpRevision()
    deps.scheduleDraw()
  })
}

/** 可见性版本信号的类型别名，供宿主保存。 */
export type LayerRevision = WritableSignal<number>
