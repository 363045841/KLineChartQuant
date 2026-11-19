/** Toolbar selection and availability share one published snapshot. */
import { createDisposeGuard } from '@/foundation/lifecycle/disposeGuard.js'
import { asReadonlySignal, batch, createSignal } from '@/foundation/reactivity/index.js'
import type { ToolbarController, ToolbarInit, ToolId } from '../types.js'

function readonlySet(values: Iterable<ToolId>): ReadonlySet<ToolId> {
  const entries = new Set(values)
  const view = Object.freeze({
    size: entries.size,
    has: (id: ToolId) => entries.has(id),
    entries: () => entries.entries(),
    keys: () => entries.keys(),
    values: () => entries.values(),
    [Symbol.iterator]: () => entries.values(),
    forEach(callback: (value: ToolId, key: ToolId, set: ReadonlySet<ToolId>) => void, thisArg?: unknown) {
      for (const entry of entries) callback.call(thisArg, entry, entry, view)
    },
  })
  return view
}

export function createToolbarController(init: ToolbarInit): ToolbarController {
  const tools = Object.freeze(init.tools.map((tool) => Object.freeze({ ...tool })))
  const toolIds = new Set(tools.map(({ id }) => id))
  const catalog = createSignal(tools)
  const activeTool = createSignal<ToolId | null>(init.initialActiveTool ?? null)
  const disabledTools = createSignal<ReadonlySet<ToolId>>(readonlySet([]))
  const { dispose, guard } = createDisposeGuard()

  return {
    tools: asReadonlySignal(catalog),
    activeTool: asReadonlySignal(activeTool),
    disabledTools: asReadonlySignal(disabledTools),
    selectTool: guard((id: ToolId) => {
      if (!toolIds.has(id) || disabledTools.peek().has(id) || activeTool.peek() === id) return
      activeTool.set(id)
    }),
    clearSelection: guard(() => {
      if (activeTool.peek() !== null) activeTool.set(null)
    }),
    setDisabled: guard((id: ToolId, disabled: boolean) => {
      const current = disabledTools.peek()
      if (disabled === current.has(id)) return
      const next = new Set(current)
      if (disabled) next.add(id)
      else next.delete(id)
      batch(() => {
        disabledTools.set(readonlySet(next))
        if (disabled && activeTool.peek() === id) activeTool.set(null)
      })
    }),
    dispose,
  }
}
