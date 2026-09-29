/** 模板持久化替身：只模拟 load/save，CRUD 由 core 的真实仓库实现。 */

import type { DrawingKind, DrawingTemplate } from '@363045841yyt/klinechart-core/engine/drawing'
import { createDrawingTemplateStore } from '@363045841yyt/klinechart-core/engine/drawing'

export function createMemoryTemplateStore(seed: Record<string, DrawingTemplate[]> = {}) {
  const data = new Map<string, DrawingTemplate[]>(
    Object.entries(seed).map(([kind, templates]) => [kind, [...templates]]),
  )
  const persistence = (kind: DrawingKind) => ({
    async load() {
      return [...(data.get(kind) ?? [])]
    },
    async save(templates: DrawingTemplate[]) {
      data.set(kind, [...templates])
      return true
    },
  })
  const store = createDrawingTemplateStore(persistence)
  return { store }
}
