# Frame Transaction Design

**Date:** 2026-07-16  
**Status:** approved for phased implementation  
**Goal:** Centralize high-frequency chart state without per-event reactive broadcasts, with strict single-generation snapshots.

## Problem

1. High-frequency pointer/scroll writes go through ordinary kernel Signals and notify every subscriber.
2. `batch()` only defers notify within one call stack; notify phase can re-enter and write more state.
3. Renderer currently writes frame geometry back into interaction state after prepare, creating a reverse write path.

## Solution: Single Frame Transaction

One immutable `ChartFrameSnapshot` per completed frame. No public `latest` dual-view.

### Phases

```
writeInput → request
rAF:
  capture → derive → seal → render → publish → complete
```

| Phase | Allowed | Forbidden |
|-------|---------|-----------|
| writeInput | merge pending input | publish, render |
| capture | swap pending → sealed input | notify |
| derive | pure compute snapshot fields | kernel action writes |
| seal | freeze ownership, bump generation | mutate sealed data |
| render | read only sealed snapshot | write kernel / published |
| publish | `published$.set(snapshot)` once | mutate snapshot |
| complete | schedule next frame if dirty | reuse sealed input |

### Invariants

1. One generation, one snapshot per successful frame.
2. `pendingInput` is private; no public latest API.
3. Renderer never writes kernel during paint.
4. Writes during render/publish go to next generation only.
5. Failed derive/render does not advance published generation.
6. Sync `draw()` uses the same flush pipeline as rAF.
7. Large arrays use structural sharing; no deep clone; optional freeze only in dev.

### State classes

- **Committed Signals:** data, settings, drawings, tool, selectedId, drag mode (pointer down/up).
- **Frame input:** pointer, scroll intent, hover inputs.
- **Frame snapshot fields:** viewport, geometry, crosshair, hover, tooltip, marker hover.

## Migration path

1. `createFrameTransaction` primitive + tests  
2. ChartRenderer builds one snapshot and renders from it  
3. Interaction pointermove → writeInput only  
4. Scroll → frame input + selectors  
5. Delete legacy frame-position / crosshair high-frequency signals  

## Non-goals

- Full reactive topological scheduler rewrite  
- Moving committed business SSOT out of kernel  
