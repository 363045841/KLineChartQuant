/**
 * Scene 工厂——组合、有序分发、生命周期。
 *
 * 设计要点：
 * - Layer 列表按**注册顺序**保存在私有数组中，`paint` 时按 z 做稳定排序。
 *   不在数组上维护有序不变量：增删保持 O(n)，且稳定排序天然给出
 *   「注册顺序」这一 tie-breaker。
 * - `layers` signal 暴露快照，每次修改都产生**新数组**，绝不原地修改——这是
 *   框架适配层依赖的不可变契约。
 * - `paint` 按 paneId 过滤 Layer，并在每个 Layer 外层做异常隔离：单个 Layer
 *   抛错不影响同 pane 的其它 Layer（原本由适配器承担的职责上移到 Scene）。
 * - `dispose` 后所有公开方法变为 no-op，与 renderer 的「dispose 冻结」语义一致。
 */

import { createSignal, type Signal } from '../../foundation/reactivity/signal.js'

import {
  LAYER_PANE_GLOBAL,
  type Layer,
  type LayerPaint,
  type Scene,
  type SceneFrame,
} from './types.js'

export function createScene<TFrame = unknown>(): Scene<TFrame> {
  // ---- 内部状态 ----------------------------------------------------------
  // 可变列表放在 signal 之外，signal.set 始终收到新快照；不直接暴露该数组。
  let layerList: Layer<TFrame>[] = []
  let disposed = false
  const layersSignal: Signal<ReadonlyArray<Layer<TFrame>>> = createSignal<
    ReadonlyArray<Layer<TFrame>>
  >([])

  const publish = (): void => {
    layersSignal.set([...layerList] as ReadonlyArray<Layer<TFrame>>)
  }

  // ---- 公开 API ----------------------------------------------------------

  const addLayer = (layer: Layer<TFrame>): void => {
    if (disposed) return
    // 重复 id 静默忽略——防两个系统（如指标控制器 + 配置恢复）同时注册同一 Layer，
    // 先注册者胜出。
    if (layerList.some((existing) => existing.id === layer.id)) return
    layerList = [...layerList, layer]
    publish()
  }

  const removeLayer = (id: string): boolean => {
    if (disposed) return false
    const removed = layerList.find((layer) => layer.id === id)
    if (!removed) return false
    const next = layerList.filter((layer) => layer.id !== id)
    layerList = next
    publish()
    // 先脱离 Scene 再释放，保证重入移除不会重复 dispose。
    disposeLayer(removed)
    return true
  }

  /** 隔离单个 Layer 的释放错误，确保其余资源仍可清理。 */
  const disposeLayer = (layer: Layer<TFrame>): void => {
    try {
      layer.dispose()
    } catch (error) {
      console.error(`[Layer] ${layer.id} dispose error:`, error)
    }
  }

  const getLayer = (id: string): Layer<TFrame> | null => {
    if (disposed) return null
    const hit = layerList.find((layer) => layer.id === id)
    return hit ?? null
  }

  const setLayerVisibility = (id: string, visible: boolean): boolean => {
    if (disposed) return false
    const layer = layerList.find((l) => l.id === id)
    if (!layer) return false
    // visible 是 Layer 上的可变字段（见接口契约）；修改不影响 layers signal 的
    // 引用相等，订阅方关心的是成员而非字段状态。
    layer.visible = visible
    return true
  }

  /** 绘制一整帧：逐 pane 选出命中且可见的 Layer，按 z 稳定排序后隔离式分发。 */
  const paint = (frame: SceneFrame): void => {
    if (disposed) return
    for (const pane of frame.panes) {
      // 区域绑定必须紧邻实际绘制，避免共享后端沿用最后一个副图的区域。
      pane.renderer.beginFrame(pane.region, { clear: pane.clear })
      // 本批要绘制的 Layer 列表
      let candidates = layerList.filter(
        (layer) =>
          (layer.pane === pane.paneId || layer.pane === LAYER_PANE_GLOBAL) && layer.visible,
      )
      // 指定了 role 集合时，只保留这些 role 的 Layer（例如 overlay 帧只画 overlay）
      if (pane.roles) {
        const roles = pane.roles
        candidates = candidates.filter((layer) => roles.includes(layer.role))
      }
      // 按 z 升序稳定排序，相同 z 保留注册顺序（ECMAScript 2019+ 保证稳定）
      candidates.sort((a, b) => a.z - b.z)
      // 依次绘制这批 Layer
      for (const layer of candidates) {
        const ctx: LayerPaint<TFrame> = {
          ...(pane.context as TFrame),
          paneId: pane.paneId,
          clear: pane.clear,
          // 本帧渲染后端由 Scene 注入，渲染器无需自行获取。
          sceneRenderer: pane.renderer,
        }
        try {
          layer.paint(ctx)
        } catch (e) {
          // 异常隔离：单个 Layer 抛错不中断同 pane 后续 Layer。
          console.error(`[Layer] ${layer.id} paint error:`, e)
        }
      }
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    // 先快照，因为 layer.dispose 可能经过期引用触发进一步修改——迭代需要可预测。
    const snapshot = layerList
    layerList = []
    for (const layer of snapshot) {
      disposeLayer(layer)
    }
    layersSignal.set([] as ReadonlyArray<Layer<TFrame>>)
  }

  return {
    layers: layersSignal,
    addLayer,
    removeLayer,
    getLayer,
    setLayerVisibility,
    paint,
    dispose,
  }
}
