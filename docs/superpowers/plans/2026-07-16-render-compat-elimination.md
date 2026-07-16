# Render Compat Elimination Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Remove legacy WebGL surface ladder, setFallbackContext, and Manager draw APIs.

**Architecture:** Drawers call sceneRenderer only; false → Canvas2D. Manager is registry-only.

**Tech Stack:** TypeScript, Vitest, existing createWebGLRenderer / Scene.

---

### Task 1: Strip legacy ladder from helpers + candle

**Files:**
- Modify: `packages/core/src/engine/renderers/linesViaRenderer.ts`
- Modify: `packages/core/src/engine/renderers/rectsViaRenderer.ts`
- Modify: `packages/core/src/engine/renderers/candle.ts`
- Modify: `packages/core/src/engine/renderers/Indicator/shared/webglBand.ts`
- Modify: `packages/core/src/engine/renderers/__tests__/candle.sceneRenderer.test.ts`

- [x] Remove surface branches from tryDraw*Gpu
- [x] Remove drawCandlesWithWebGL path
- [x] Remove compositeLineSurface
- [x] Update candle tests (no candleWebGLSurface)

### Task 2: Remove public dual-path APIs

**Files:**
- Modify: `packages/core/src/foundation/plugin/types.ts`
- Modify: `packages/core/src/engine/render/chartRenderer.ts`
- Modify: `packages/core/src/rendering/render/createWebGLRenderer.ts`
- Modify: `packages/core/src/foundation/plugin/rendererPluginManager.ts`
- Modify: `packages/core/src/engine/__tests__/renderSinglePath.test.ts`
- Modify: `packages/core/src/rendering/render/__tests__/webglRenderer.fallback.test.ts`
- Modify: `packages/core/src/engine/renderers/timeAxis.ts` (comment only if needed)

- [x] Drop surface fields from RenderContext
- [x] Stop injecting surfaces / setFallbackContext in chartRenderer
- [x] Delete setFallbackContext implementation
- [x] Delete Manager.render / renderPlugin
- [x] Fix tests
- [x] Remove per-pane Candle/Line WebGL surfaces from PaneRenderer

### Task 3: Verify

- [x] Related vitest suites green (candle/ma/boll/ene/single-path/fallback)
- [x] core `tsc --noEmit` clean aside pre-existing baseUrl deprecation
- [x] Grep zero hits for deleted APIs in production packages/core/src
- [ ] Optional full `pnpm test:packages` + hand-check WebGL on/off
