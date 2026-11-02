/**
 * Scene 实现：拥有 Layer 集合、排序与逐帧分发，并把原语合成收敛到每目标一次。
 *
 * 与 `types.ts` 的分工：本文件只有运行时装配，类型契约全部在 `types.ts`。
 */

import type { DataTransform } from '@/foundation/plugin/types.js'
import type { Signal } from '../../foundation/reactivity/signal.js'
import { createSignal } from '../../foundation/reactivity/signal.js'
import { createPrimitiveComposer } from '../primitives/impl/composer.js'
import { primitiveSink } from '../primitives/impl/paint.js'
import type {
  PaintPrimitive,
  PrimitiveClip,
  PrimitiveComposer,
  PrimitiveSurface,
} from '../primitives/types.js'
import type {
  Layer,
  LayerPaint,
  LayerRole,
  PrimitiveDrawContext,
  Scene,
  SceneFrame,
} from './types.js'
import { LAYER_PANE_GLOBAL, SCENE_TARGET_Z, scenePaintTarget } from './types.js'

/** 数据角色只按完整 Pane 边界裁切；背景网格与 overlay 由自身表面约束。 */
const CLIPPED_ROLES: ReadonlySet<LayerRole> = new Set([
  'primary',
  'indicator',
  'component',
  'drawing',
])

/** 同一可见表面上按裁切区分的直出批次。 */
interface SurfaceBatch {
  primitives: PaintPrimitive[]
  dpr: number
  transform?: DataTransform
  clip?: PrimitiveClip
}

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
    // 可见 GPU 表面按 pane 累积；同一表面按裁切区分批次，帧末一次直出。
    const surfaces = new Map<PrimitiveSurface, SurfaceBatch[]>()
    /**
     * 几何写可见表面，文字仍走它上方的 2D 目标。
     *
     * 文字与几何分属两个 DOM 层，相对顺序由层序决定而非提交顺序；同一次提交的
     * 文字因此可以累积成一批交给合成器，既保持文字之间的先后顺序，也不必逐条
     * 读取目标状态。
     */
    const submitToSurface = (
      surface: PrimitiveSurface,
      composer: PrimitiveComposer,
      primitives: readonly PaintPrimitive[],
      dpr: number,
      transform: DataTransform | undefined,
      clip: PrimitiveClip | undefined,
    ): void => {
      let batches = surfaces.get(surface)
      let entry = batches?.find((batch) => batch.clip === clip)
      const text: PaintPrimitive[] = []
      for (const primitive of primitives) {
        if (primitive.kind === 'text') {
          text.push(primitive)
          continue
        }
        if (!batches) {
          batches = []
          surfaces.set(surface, batches)
        }
        if (!entry) {
          entry = { primitives: [], dpr, clip }
          batches.push(entry)
        }
        entry.dpr = dpr
        entry.transform = transform
        entry.primitives.push(primitive)
      }
      if (text.length > 0) composer.submit(text, dpr, transform)
    }
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
      // 裁剪矩形只由 Pane 尺寸构造，业务上下文中的价格留白不影响它。
      const paneClip: PrimitiveClip = { x: 0, y: 0, ...pane.bounds }
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
      // Pane 边界只作用于数据层：进入前设置，离开前落盘并恢复。
      let clipTarget: CanvasRenderingContext2D | null = null
      let clipActive = false
      const releaseClip = (): void => {
        if (!clipTarget || !clipActive) return
        composers.get(clipTarget)?.flush()
        clipTarget.restore()
        clipActive = false
      }
      // 依次绘制这批 Layer
      for (const layer of candidates) {
        const target = pane.targets[scenePaintTarget(layer.role)]
        if (!target) continue
        const clip = CLIPPED_ROLES.has(layer.role) ? paneClip : undefined
        if (target !== clipTarget) {
          releaseClip()
          clipTarget = target
        }
        if ((clip !== undefined) !== clipActive) {
          composerFor(target, pane.renderer).flush()
          if (clip) {
            target.save()
            target.beginPath()
            target.rect(clip.x, clip.y, clip.width, clip.height)
            target.clip()
            clipActive = true
          } else {
            target.restore()
            clipActive = false
          }
        }
        const composer = composerFor(target, pane.renderer)
        if (layer.kind === 'draw-list') {
          // 纯增量图层：没有 ctx；有可见 GPU 表面时直接写入，否则进入合成器。
          const surface = pane.gpuSurface
          const context: PrimitiveDrawContext<TFrame> = {
            ...withoutContext(pane.context as TFrame),
            primitives: surface
              ? (primitives, dpr, transform) =>
                  submitToSurface(surface, composer, primitives, dpr, transform, clip)
              : composer.submit,
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
          // 本帧渲染后端与目标已绑定的提交入口由 Scene 注入。
          sceneRenderer: pane.renderer,
          primitives: composer.submit,
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
      releaseClip()
      // 主图带直出：按裁切批次写入可见表面；失败整批回落到 2D 合成路径。
      const surface = pane.gpuSurface
      if (surface) {
        const batches = surfaces.get(surface)
        surfaces.delete(surface)
        let cleared = false
        const flushBatch = (batch?: SurfaceBatch): void => {
          const shouldClear = pane.clear && !cleared
          const dpr = batch?.dpr ?? pane.dpr ?? 1
          const primitives = batch?.primitives ?? []
          if (primitives.length === 0 && !shouldClear) return
          const painted = surface.paint(primitives, dpr, shouldClear, batch?.transform, batch?.clip)
          if (shouldClear && painted) cleared = true
          if (painted || primitives.length === 0) return
          // 直出失败：整批回落到 2D 合成，裁切由目标自身保证。
          const main = pane.targets.main
          if (!main) return
          main.save()
          if (batch?.clip) {
            main.beginPath()
            main.rect(batch.clip.x, batch.clip.y, batch.clip.width, batch.clip.height)
            main.clip()
          }
          const composer = composerFor(main, pane.renderer)
          composer.submit(primitives, dpr, batch?.transform)
          composer.flush()
          main.restore()
        }
        if (batches?.length) for (const batch of batches) flushBatch(batch)
        else flushBatch()
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
