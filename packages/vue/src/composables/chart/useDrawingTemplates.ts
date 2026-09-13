/**
 * Drawing template state for the selected-drawing toolbar (TV-style apply/Save As).
 * Storage is pluggable: hosts inject a `DrawingTemplateStore` (e.g. backed by a
 * server route); when absent, a localStorage default keeps the feature usable.
 * Tool identity is the drawing `kind`; adapters may namespace it for persistence.
 */
import { ref, type Ref } from 'vue'

import type { DrawingStyle } from '@363045841yyt/klinechart-core/plugin'

export interface DrawingTemplateRecord {
  name: string
  tool: string
}

export interface DrawingTemplateStore {
  list(): Promise<ReadonlyArray<DrawingTemplateRecord>>
  load(tool: string, name: string): Promise<Partial<DrawingStyle> | null>
  save(tool: string, name: string, style: Partial<DrawingStyle>): Promise<void>
  remove(tool: string, name: string): Promise<void>
}

const STORAGE_KEY = 'klinechart.drawing-templates'

/** 默认存储：localStorage，按 kind 分组。 */
function createLocalStorageStore(): DrawingTemplateStore {
  const readAll = (): Record<string, Record<string, Partial<DrawingStyle>>> => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    } catch {
      return {}
    }
  }
  const writeAll = (all: Record<string, Record<string, Partial<DrawingStyle>>>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch {
      /* quota exceeded */
    }
  }
  return {
    async list() {
      const all = readAll()
      const items: DrawingTemplateRecord[] = []
      for (const [tool, templates] of Object.entries(all)) {
        for (const name of Object.keys(templates)) items.push({ name, tool })
      }
      return items.sort((left, right) => left.tool.localeCompare(right.tool) || left.name.localeCompare(right.name))
    },
    async load(tool, name) {
      return readAll()[tool]?.[name] ?? null
    },
    async save(tool, name, style) {
      const all = readAll()
      const group = all[tool] ?? {}
      group[name] = style
      all[tool] = group
      writeAll(all)
    },
    async remove(tool, name) {
      const all = readAll()
      if (all[tool]) {
        delete all[tool][name]
        writeAll(all)
      }
    },
  }
}

export function useDrawingTemplates(store: Ref<DrawingTemplateStore | undefined>) {
  const templates = ref<ReadonlyArray<DrawingTemplateRecord>>([])

  async function reload(): Promise<void> {
    const active = store.value ?? fallbackStore()
    try {
      templates.value = await active.list()
    } catch {
      templates.value = []
    }
  }

  // 懒初始化默认存储（模块外不可变引用，避免每次渲染重建）
  let localFallback: DrawingTemplateStore | null = null
  function fallbackStore(): DrawingTemplateStore {
    localFallback ??= createLocalStorageStore()
    return localFallback
  }

  async function apply(tool: string, name: string): Promise<Partial<DrawingStyle> | null> {
    const active = store.value ?? fallbackStore()
    try {
      return await active.load(tool, name)
    } catch {
      return null
    }
  }

  async function save(tool: string, name: string, style: Partial<DrawingStyle>): Promise<boolean> {
    const active = store.value ?? fallbackStore()
    try {
      await active.save(tool, name, style)
      await reload()
      return true
    } catch {
      return false
    }
  }

  async function remove(tool: string, name: string): Promise<boolean> {
    const active = store.value ?? fallbackStore()
    try {
      await active.remove(tool, name)
      await reload()
      return true
    } catch {
      return false
    }
  }

  return { templates, reload, apply, save, remove }
}
