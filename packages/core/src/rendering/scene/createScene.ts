/**
 * Scene factory — composition, ordered iteration, lifecycle.
 *
 * Design notes:
 * - The layer list is stored in **registration order** in a private array.
 *   `paintPane` performs a stable sort by `z` at paint time. We do not
 *   maintain a sorted invariant on the array itself because:
 *     1. Add/remove must remain O(n), and z is a number, so a sorted
 *        insert is O(n) anyway.
 *     2. Stable sort by z gives the documented tie-breaker (registration
 *        order) "for free" without parallel arrays or registration counters.
 * - The `layers` signal exposes a snapshot. Every mutation produces a NEW
 *   array via spread or filter — never mutate the previous value. This is
 *   the immutability contract framework adapters rely on.
 * - After `dispose`, every public method becomes a no-op. The `disposed`
 *   flag is checked at the top of each method; this matches the renderer's
 *   "dispose freezes" semantic and prevents callers from leaking listeners
 *   into a torn-down scene.
 */

import { createSignal, type Signal } from '../../foundation/reactivity/signal'

import type { Layer, LayerRole, PaintContext, Scene } from './types'

export function createScene(): Scene {
  // ---- internal state ----------------------------------------------------
  // Mutable list held outside the signal so that signal.set always receives
  // a fresh frozen-shape snapshot. We never expose this array directly.
  let layerList: Layer[] = []
  let disposed = false
  const layersSignal: Signal<ReadonlyArray<Layer>> = createSignal<ReadonlyArray<Layer>>([])

  const publish = (): void => {
    layersSignal.set([...layerList] as ReadonlyArray<Layer>)
  }

  // ---- public API --------------------------------------------------------

  const addLayer = (layer: Layer): void => {
    if (disposed) return
    // Reject duplicate ids silently — protects against double-registration
    // races where two systems (e.g. an indicator controller + a config
    // restore) both attempt to add the same layer. The first wins.
    if (layerList.some((existing) => existing.id === layer.id)) return
    layerList = [...layerList, layer]
    publish()
  }

  const removeLayer = (id: string): boolean => {
    if (disposed) return false
    const next = layerList.filter((layer) => layer.id !== id)
    if (next.length === layerList.length) return false
    layerList = next
    publish()
    return true
  }

  const getLayer = (id: string): Layer | null => {
    if (disposed) return null
    const hit = layerList.find((layer) => layer.id === id)
    return hit ?? null
  }

  const setLayerVisibility = (id: string, visible: boolean): boolean => {
    if (disposed) return false
    const layer = layerList.find((l) => l.id === id)
    if (!layer) return false
    // `visible` is a mutable field on the layer (per the interface);
    // mutating it does not affect the `layers` signal's identity because
    // subscribers care about membership, not field state. This matches
    // how chart adapters batch visibility toggles (no re-render storm).
    layer.visible = visible
    return true
  }

  /** 按 role 和可见性过滤 layer，z 排序后逐层 paint */
  const paintPane = (ctx: PaintContext, roles?: ReadonlyArray<LayerRole>): void => {
    if (disposed) return
    // 选出属于当前 pane 或全局、且可见的 layer
    let candidates = layerList.filter(
      (layer) => (layer.paneRole === ctx.paneRole || layer.paneRole === 'global') && layer.visible,
    )
    // 若传了 roles 参数，进一步按角色过滤（如只画 overlay）
    if (roles) {
      candidates = candidates.filter((layer) => roles.includes(layer.role))
    }
    // 按 z 升序稳定排序，相同时保留注册顺序（ECMAScript 2019+ 保证 sort 稳定）
    candidates.sort((a, b) => a.z - b.z)
    for (const layer of candidates) {
      layer.paint(ctx)
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    // Snapshot first because layer.dispose may attempt further mutations
    // through a stale reference — we want predictable iteration here.
    const snapshot = layerList
    layerList = []
    for (const layer of snapshot) {
      try {
        layer.dispose()
      } catch {
        // Swallow per-layer dispose errors so one broken layer can't
        // strand the rest. A logger would go here in production; the
        // headless core does not own a logger contract yet.
      }
    }
    layersSignal.set([] as ReadonlyArray<Layer>)
  }

  return {
    layers: layersSignal,
    addLayer,
    removeLayer,
    getLayer,
    setLayerVisibility,
    paintPane,
    dispose,
  }
}
