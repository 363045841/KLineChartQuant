# Design: Render Compat Layer Elimination

**Date:** 2026-07-16  
**Status:** Approved (session)  
**Branch:** `feat/render-single-path-scene-renderer`  
**Predecessor:** Phase 0+1 (single-path Scene; candle/line/rect via Renderer API)

## Goal

Delete remaining render dual-path debt. Production drawers use only:

```
context.sceneRenderer  →  success → composite
                       →  false   → context.ctx Canvas2D
```

No legacy surface fields, no Manager frame draw entry, no setFallbackContext.

## Non-goals

- WebGPU backend
- Rewriting createLayerFromPlugin into native Layers
- Changing indicator math / StateKernel

## Target shape

```
prepareFrameData
  → RenderContext { sceneRenderer, ctx, geometry, settings, ... }
  → scene.paintPane
      → Layer.paint → plugin.draw
          → draw*ViaRenderer(sceneRenderer) | 2D
  → axes
```

`RendererPluginManager`: register / unregister / enabled / notify* only.  
`CandleWebGLSurface` / `LineWebGLSurface`: internal to `createWebGLRenderer` only.

## Delete list

| Item | Action |
|------|--------|
| `RenderContext.candleWebGLSurface` / `lineWebGLSurface` | Remove fields + injection |
| `tryDrawLinesGpu` / `tryDrawFilledBandGpu` / `tryDrawRectsGpu` legacy branch | sceneRenderer only |
| `drawCandlesWithWebGL` / `compositeWebGLToMainCanvas` | Delete |
| `compositeLineSurface` (surface-typed) | Delete |
| `setFallbackContext` + chartRenderer `(as any)` calls | Delete |
| `RendererPluginManager.render` / `renderPlugin` | Delete |
| Ladder-preferring tests | Assert Renderer-only / fail-closed 2D |

## Done when

- `rg candleWebGLSurface|lineWebGLSurface|setFallbackContext|manager\.render|renderPlugin` in production `packages/core/src` → zero (tests may mock Renderer only)
- `pnpm test:packages` + `pnpm type-check` green
- Manual: WebGL on/off × candle / MA / BOLL / volume / MACD / timeShare / crosshair / drawing
