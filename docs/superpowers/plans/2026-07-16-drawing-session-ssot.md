# Drawing Session SSOT Implementation Plan

> Status: implemented in-session (2026-07-16)

**Goal:** Kernel holds only committed drawings; session holds preview/drag; DrawingStore merges for paint.

## Done

1. Spec: `docs/superpowers/specs/2026-07-16-drawing-session-ssot-design.md`
2. `DrawingState` — no full list; `preview` + `dragOverride`; `mergePaint`; commit on `commitDrag` / CRUD
3. `DrawingInteractionController` — move uses session only; up commits drag
4. `DrawingStore` + Chart `getOverlay` from `drawingSession.getPaintOverlay()`
5. `DrawingChartAdapter.requestDraw` + ChartController wiring
6. Chart `setDrawings` strips `__preview__`
7. Vue: stop mirroring session list on pointermove; drop `setDrawings` echo on kernel subscribe
8. Tests: drawingState / drawingStore / chart.dpr — green

## Verify

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run \
  src/engine/drawing/__tests__/drawingState.workCopy.test.ts \
  src/engine/drawing/__tests__/drawingStore.projection.test.ts \
  src/engine/__tests__/chart.dpr.test.ts
```
