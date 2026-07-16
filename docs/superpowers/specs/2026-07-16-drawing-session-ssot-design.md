# Drawing Session SSOT Design

**Date:** 2026-07-16  
**Status:** approved for implementation  
**Scope:** Remove dual `drawings` copy; keep high-frequency session state out of kernel

## Problem

1. `DrawingState` holds a full mutable `drawings[]` while `kernel.drawing.drawings` is the business SSOT (shadow cache).
2. Preview (`__preview__`) and in-drag geometry are written through `adapter.setDrawings` into kernel on every pointermove.

## Target

| Layer | Owns | Update rate |
|-------|------|-------------|
| `kernel.drawing` | committed drawings, tool, selectedId | commit only |
| session (`DrawingState` / controller) | preview, drag override, pending anchors | pointermove |
| `DrawingStore` | paint merge: kernel ⊕ session overlay | each frame peek |

## Rules

1. Kernel `drawings` never contains `__preview__`.
2. pointermove preview / drag must not call `kernel.drawing.actions.setDrawings`.
3. pointerup / create / style / delete commit once via adapter → kernel.
4. Session does not keep a full list copy; reads committed list via `adapter.getFullDrawings()`.
5. Paint: `DrawingStore.getVisibleByPane` merges kernel list with session overlay (drag replaces by id; preview appends).

## API shape

- `DrawingState`: `preview`, `dragOverride` only; `getPaintOverlay()`, `setPreview` / `setDragOverride` / `commitDrag` / committed CRUD via adapter.
- `DrawingChartAdapter.requestDraw()` for session-only paint (no kernel write).
- `DrawingStoreDeps.getOverlay?: () => ReadonlyArray<DrawingObject>`.
- Chart wires `getOverlay` from `drawingSession.getPaintOverlay()`.

## Non-goals

- Undo stack, multi-pane drawing UX, callback → signal migration in Vue.
