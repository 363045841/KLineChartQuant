/**
 * DrawingController — framework-agnostic implementation.
 *
 * Extracted from src/core/drawing/plugin.ts (and the surrounding DrawingStore
 * machinery in src/core/drawing/). The controller owns only the small piece
 * of public, observable state that the UI needs:
 *
 *   - which drawing tool the user has picked (or null for the cursor)
 *   - how many drawings have been committed to the chart
 *
 * Everything else — anchor maths, primitive computation, hit testing,
 * canvas rendering, axis label pushing, selection IDs — stays in the
 * existing DrawingStore + Scene Layer. Those run inside the chart engine,
 * not the public controller surface. Adapters call setActiveTool() in
 * response to LeftToolbar.vue clicks; clearAll() / deleteLast() are wired up
 * to the store mutations by the chart adapter, with this controller serving
 * as the source of truth for drawingCount.
 */

import type { DrawingToolId } from '@/engine/drawing/index.js'
import { createDisposeGuard } from '@/foundation/lifecycle/disposeGuard.js'
import { createSignal, type Signal } from '@/foundation/reactivity/index.js'
import type { DrawingController, DrawingInit, DrawingState } from '../types.js'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDrawingController(init?: DrawingInit): DrawingController {
  // -------------------------------------------------------------------
  // Single signal that bundles both fields. This matches the interface
  // contract (`state: Signal<DrawingState>`) and ensures both fields are
  // updated atomically — subscribers receive one notification per change.
  // -------------------------------------------------------------------
  const initialCount = Math.max(0, init?.initialDrawingCount ?? 0)
  const state: Signal<DrawingState> = createSignal<DrawingState>({
    activeTool: init?.initialActiveTool ?? null,
    drawingCount: initialCount,
  })

  // -------------------------------------------------------------------
  // Mutations — every update goes through immutable spread.
  // -------------------------------------------------------------------
  function setActiveTool(tool: DrawingToolId | null): void {
    const current = state.peek()
    if (current.activeTool === tool) return // no change
    state.set({ ...current, activeTool: tool })
  }

  function clearAll(): void {
    const current = state.peek()
    if (current.drawingCount === 0) return // no change
    state.set({ ...current, drawingCount: 0 })
  }

  function deleteLast(): void {
    const current = state.peek()
    if (current.drawingCount <= 0) return // floor at 0 — no-op
    state.set({ ...current, drawingCount: current.drawingCount - 1 })
  }

  // -------------------------------------------------------------------
  // Disposal — 销毁后所有变更方法静默 no-op，生命周期由共享守卫统一处理。
  // -------------------------------------------------------------------
  const { dispose, guard } = createDisposeGuard()

  return {
    state,
    setActiveTool: guard(setActiveTool),
    clearAll: guard(clearAll),
    deleteLast: guard(deleteLast),
    dispose,
  }
}
