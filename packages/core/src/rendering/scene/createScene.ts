/**
 * Scene 实现：拥有 Layer 集合、排序与逐帧分发，并把原语合成收敛到每目标一次。
 *
 * 与 `types.ts` 的分工：本文件只有运行时装配，类型契约全部在 `types.ts`。
 */
import type { Signal } from '../../foundation/reactivity/signal.js'
import { createSignal } from '../../foundation/reactivity/signal.js'
import { createPrimitiveComposer, type PrimitiveComposer } from '../primitives/impl/composer.js'
import { primitiveSink } from '../primitives/impl/paint.js'
import type {
  Layer,
  LayerPaint,
  PrimitiveDrawContext,
  Scene,
  SceneFrame,
} from './types.js'
import { LAYER_PANE_GLOBAL, SCENE_TARGET_Z, scenePaintTarget } from './types.js'

/**
 * 去掉帧上下文里的 `ctx`。
 *
 * 纯增量图层通过类型拿不到 ctx；运行时也必须真的不传，否则"拿不到"只是编译期假象。
 */
function withoutContext<TFrame>(frame: TFrame): Omit<TFrame, 'ctx'> {
  const copy: Record<string, unknown> = { ...(frame as Record<string, unknown>) }
  delete copy.ctx
  return copy as Omit<TFrame, 'ctx'>
}

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
    // 每个绘制目标一个合成器：同一帧内按层序累积，帧末统一落盘。
    const composers = new Map<CanvasRenderingContext2D, PrimitiveComposer>()
    /** 取（或建立）目标合成器；后端由 pane 提供，目标由 Scene 选定。 */
    const composerFor = (
      target: CanvasRenderingContext2D,
      backend: SceneFrame['panes'][number]['renderer'],
    ): PrimitiveComposer => {
      let composer = composers.get(target)
      if (!composer) {
        composer = createPrimitiveComposer(primitiveSink(backend.primitives), target)
        composers.set(target, composer)
      }
      return composer
    }
    for (const pane of frame.panes) {
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
      candidates.sort(
        (a, b) =>
          SCENE_TARGET_Z[scenePaintTarget(a.role)] - SCENE_TARGET_Z[scenePaintTarget(b.role)] ||
          a.z - b.z,
      )
      // 依次绘制这批 Layer
      for (const layer of candidates) {
        const target = pane.targets[scenePaintTarget(layer.role)]
        if (!target) continue
        const composer = composerFor(target, pane.renderer)
        if (layer.kind === 'draw-list') {
          // 纯增量图层：没有 ctx，图元由合成器累积到帧末。
          const context: PrimitiveDrawContext<TFrame> = {
            ...withoutContext(pane.context as TFrame),
            primitives: composer.submit,
            measureContext: target,
            paneId: pane.paneId,
            clear: pane.clear,
            sceneRenderer: pane.renderer,
          }
          try {
            layer.paint(context)
          } catch (e) {
            console.error(`[Layer] ${layer.id} paint error:`, e)
          }
          continue
        }
        // 完整上下文图层可能自带裁剪或局部坐标系：前后各自落盘。
        composer.flush()
        const ctx: LayerPaint<TFrame> = {
          ...(pane.context as TFrame),
          ctx: target,
          paneId: pane.paneId,
          clear: pane.clear,
          // 本帧渲染后端与带目标提交入口由 Scene 注入。
          sceneRenderer: pane.renderer,
          primitives: composer.sink,
        }
        target.save()
        try {
          layer.paint(ctx)
        } catch (e) {
          // 异常隔离：单个 Layer 抛错不中断同 pane 后续 Layer。
          console.error(`[Layer] ${layer.id} paint error:`, e)
        } finally {
          target.restore()
        }
        composer.flush()
      }
    }
    // 帧末统一落盘：每个目标只做一次离屏渲染与合成。
    for (const composer of composers.values()) composer.flush()
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
