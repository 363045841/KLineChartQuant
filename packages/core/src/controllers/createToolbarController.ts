/**
 * ToolbarController — framework-agnostic implementation.
 *
 * Extracted from src/components/LeftToolbar.vue. This module owns the pure
 * state machine of the toolbar:
 *   - the registered tool list (catalog)
 *   - which tool is currently active (selection)
 *   - which tools are disabled (per-id mask)
 *
 * Behaviours owned here:
 *   - Group-based mutual exclusion (radio): selecting a tool deselects any
 *     other active tool in the same `group` (used in LeftToolbar.vue for the
 *     "lines" / "channels" tool groups via parent + children).
 *   - Disabled-state gating: a disabled tool cannot be selected. Disabling a
 *     currently-active tool clears the selection.
 *   - Idempotent disposal: post-dispose mutators are silent no-ops.
 *
 * Everything DOM / icons / click handlers / pointer event stoppers / Teleport
 * for the settings modal stays in the Vue adapter — the controller deals
 * only with the data layer.
 */

import { createSignal, type Signal } from '../foundation/reactivity/index'

import type { ToolbarController, ToolDefinition, ToolId } from './types'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ToolbarInit {
  tools: ReadonlyArray<ToolDefinition>
  initialActiveTool?: ToolId | null
}

export function createToolbarController(init: ToolbarInit): ToolbarController {
  // -------------------------------------------------------------------
  // Signals (state)
  // -------------------------------------------------------------------
  const tools: Signal<ReadonlyArray<ToolDefinition>> = createSignal<ReadonlyArray<ToolDefinition>>(
    init.tools,
  )
  const activeTool: Signal<ToolId | null> = createSignal<ToolId | null>(
    init.initialActiveTool ?? null,
  )
  const disabledTools: Signal<ReadonlySet<ToolId>> = createSignal<ReadonlySet<ToolId>>(
    new Set<ToolId>(),
  )

  // -------------------------------------------------------------------
  // Lookups (use peek — mutations must not track in `effect`)
  // -------------------------------------------------------------------
  function findTool(id: ToolId): ToolDefinition | null {
    const list = tools.peek()
    for (const t of list) {
      if (t.id === id) return t
    }
    return null
  }

  function isDisabled(id: ToolId): boolean {
    return disabledTools.peek().has(id)
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------
  function selectTool(id: ToolId): void {
    const tool = findTool(id)
    if (tool === null) return // unknown id — no-op
    if (isDisabled(id)) return // disabled — no-op

    // Group-based mutual exclusion: when the requested tool belongs to a
    // `group`, deselect any currently-active tool that shares the group.
    // (Group membership is metadata on the definition; the controller
    // does not infer groups from parent/child relations — adapters that
    // model nested groups should flatten them with a shared group key.)
    const currentActive = activeTool.peek()
    if (currentActive !== null && tool.group !== undefined) {
      const currentTool = findTool(currentActive)
      if (currentTool !== null && currentTool.group === tool.group && currentTool.id !== tool.id) {
        // Replace: writing the new id covers both "deselect old" and
        // "select new" in a single notification.
      }
    }

    activeTool.set(id)
  }

  function clearSelection(): void {
    activeTool.set(null)
  }

  function setDisabled(id: ToolId, disabled: boolean): void {
    const current = disabledTools.peek()
    const has = current.has(id)
    if (disabled === has) return // no change

    // Immutable update — never mutate the existing Set in place.
    const next = new Set(current)
    if (disabled) {
      next.add(id)
    } else {
      next.delete(id)
    }
    disabledTools.set(next)

    // If the disabled tool was the active one, clear the active signal
    // so adapters re-render without an "active + disabled" state.
    if (disabled && activeTool.peek() === id) {
      activeTool.set(null)
    }
  }

  // -------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------
  // After dispose() the controller becomes inert: mutators silently no-op
  // so previously-attached subscribers see no further notifications.
  let disposed = false

  function dispose(): void {
    if (disposed) return
    disposed = true
  }

  function guard<T extends (...args: never[]) => unknown>(fn: T): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      if (disposed) return undefined as ReturnType<T>
      return fn(...args) as ReturnType<T>
    }) as T
  }

  return {
    tools,
    activeTool,
    disabledTools,
    selectTool: guard(selectTool),
    clearSelection: guard(clearSelection),
    setDisabled: guard(setDisabled),
    dispose,
  }
}
