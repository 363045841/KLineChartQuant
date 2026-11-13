/** 模板持久化替身：用公共内存仓库实现与生产相同的 DocumentStore 契约。 */
import type { DrawingKind, DrawingTemplate } from '@363045841yyt/klinechart-core/engine/drawing'
import { createDrawingTemplateStore } from '@363045841yyt/klinechart-core/engine/drawing'
import { createMemoryDocumentStore } from '@363045841yyt/klinechart-core/persistence'

export function createMemoryTemplateStore(seed: Record<string, DrawingTemplate[]> = {}) {
  const stores = new Map<
    DrawingKind,
    ReturnType<typeof createMemoryDocumentStore<DrawingTemplate[]>>
  >(
    Object.entries(seed).map(([kind, templates]) => [
      kind as DrawingKind,
      createMemoryDocumentStore<DrawingTemplate[]>([...templates]),
    ]),
  )
  const store = createDrawingTemplateStore((kind) => {
    let current = stores.get(kind)
    if (!current) {
      current = createMemoryDocumentStore<DrawingTemplate[]>()
      stores.set(kind, current)
    }
    return current
  })
  return { store }
}
