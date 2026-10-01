/**
 * 渲染 Layer 注册表测试替身。
 *
 * 按 Layer.id 存取、移除即释放，与 Scene 的 add/remove 语义保持一致，
 * 供 SubPaneManager / ChartIndicatorManager 等依赖 Layer 注册的用例复用。
 */

import { vi } from 'vitest'

import type { RenderContext } from '@/foundation/plugin'
import type { Layer } from '@/rendering/scene/types'

/** 内存 Layer 注册表；useRenderer / removeRenderer 为可断言的 vi.fn。 */
export function createRendererLayerStore() {
  const layers = new Map<string, Layer<RenderContext>>()
  return {
    layers,
    /** 同 ID 首个实例胜出，与 Scene.addLayer 一致。 */
    useRenderer: vi.fn((layer: Layer<RenderContext>) => {
      if (!layers.has(layer.id)) layers.set(layer.id, layer)
    }),
    /** 移除并释放，与 Scene.removeLayer 一致。 */
    removeRenderer: vi.fn((id: string) => {
      const layer = layers.get(id)
      if (!layer) return
      layers.delete(id)
      layer.dispose()
    }),
    /** 按完整 ID 查询；不存在返回 undefined。 */
    getRenderer: (id: string) => layers.get(id),
    /** 按完整 ID 查询；不存在返回 null（IndicatorDependencies 语义）。 */
    getLayer: (id: string) => layers.get(id) ?? null,
  }
}
