# Kernel B-Class Residual SSOT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ChartSettings, per-pane scaleType, chartMode, and DrawingToolId into ChartStateKernel with Chart as the sole domain write entry; eliminate dual plain bags and dead legacy tool types on the engine path.

**Architecture:** Four sequential commits on `feat/vue-reactivity-scroll`: B1 `settingsState` → B4 `DrawingToolId` engine path → B2 `paneScaleTypes` → B3 `modeState`. Managers/projectors read ReadonlySignals; session runtime (PriceScale offset, drawing anchors) stays local.

**Tech Stack:** TypeScript, vitest (jsdom), existing `createSubState` / `batch` / `deepFreezeSnapshot`, `@363045841yyt/klinechart-core`

**Spec:** `docs/superpowers/specs/2026-07-15-kernel-b-class-settings-mode-tool-design.md`

**Principles (AGENTS.md):** SSOT via Actions; computed for derivation; ReadonlySignal outward; effect isolation; batch multi-field writes.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `packages/core/src/engine/state/settingsState.ts` | B1 SSOT for resolved ChartSettings |
| `packages/core/src/engine/state/__tests__/settingsState.test.ts` | B1 unit tests |
| `packages/core/src/engine/state/modeState.ts` | B3 chartMode id |
| `packages/core/src/engine/state/__tests__/modeState.test.ts` | B3 unit tests |
| `packages/core/src/engine/state/paneState.ts` | B2 +paneScaleTypes |
| `packages/core/src/engine/state/drawingState.ts` | B4 DrawingToolId |
| `packages/core/src/engine/state/chartStateKernel.ts` | Compose settings + mode; dispose; flat signals |
| `packages/core/src/engine/state/index.ts` | Re-exports |
| `packages/core/src/engine/chart.ts` | updateSettings / setDrawingTool / setActiveMode glue |
| `packages/core/src/engine/render/chartRenderer.ts` | settings$ inject |
| `packages/core/src/engine/controller/interaction.ts` | settings$ inject |
| `packages/core/src/engine/drawing/interaction.ts` | Session applyTool; no private tool SSOT |
| `packages/core/src/engine/drawing/toolConfig.ts` | DrawingToolId (existing source of truth) |
| `packages/core/src/controllers/types.ts` | Adapter + controller tool API |
| `packages/core/src/controllers/createChartController.ts` | Expose tool/mode/settings as needed |
| `packages/vue/src/composables/chart/useDrawingManager.ts` | Select tool via controller |
| `packages/core/src/engine/__tests__/chart.dpr.test.ts` | Glue tests (extend) |
| `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` | Status checkboxes for B-class |

---

## Task 1: B1 — settingsState module + tests

**Files:**
- Create: `packages/core/src/engine/state/settingsState.ts`
- Create: `packages/core/src/engine/state/__tests__/settingsState.test.ts`

- [ ] **Step 1: Write failing unit tests**

```ts
import { describe, it, expect } from 'vitest'
import { createSettingsState } from '../settingsState'
import { resolveSettings } from '../../../foundation/config/chartSettings'

describe('settingsState', () => {
  it('starts as fully resolved defaults', () => {
    const s = createSettingsState()
    const resolved = resolveSettings({})
    expect(s.readonly.settings.peek().showGridLines).toBe(resolved.showGridLines)
    expect(s.readonly.settings.peek().rightAxisType).toBe(resolved.rightAxisType)
  })

  it('replace merges partial via resolveSettings', () => {
    const s = createSettingsState()
    s.actions.replace({ showGridLines: false })
    expect(s.readonly.settings.peek().showGridLines).toBe(false)
    expect(s.readonly.settings.peek().enableWebGLRendering).toBeDefined()
  })

  it('patch merges onto current then re-resolves', () => {
    const s = createSettingsState()
    s.actions.replace({ showGridLines: false })
    s.actions.patch({ rightAxisType: 'log' })
    expect(s.readonly.settings.peek().showGridLines).toBe(false)
    expect(s.readonly.settings.peek().rightAxisType).toBe('log')
  })

  it('equal-skip does not notify on identical replace', () => {
    const s = createSettingsState()
    s.actions.replace({ showGridLines: true })
    let n = 0
    s.readonly.settings.subscribe(() => {
      n++
    })
    s.actions.replace({ showGridLines: true })
    expect(n).toBe(0)
  })

  it('snapshot is frozen', () => {
    const s = createSettingsState()
    const snap = s.readonly.settings.peek() as ChartSettings
    expect(() => {
      ;(snap as { showGridLines?: boolean }).showGridLines = false
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/settingsState.test.ts
```

Expected: module not found / FAIL

- [ ] **Step 3: Implement `settingsState.ts`**

```ts
import { batch, createSubState } from '../../foundation/reactivity/signal'
import {
  resolveSettings,
  type ChartSettings,
} from '../../foundation/config/chartSettings'
import { deepFreezeSnapshot } from './immutable'

function snapshotSettings(partial?: Partial<ChartSettings>): Readonly<ChartSettings> {
  return deepFreezeSnapshot(resolveSettings(partial)) as Readonly<ChartSettings>
}

function settingsEqual(a: Readonly<ChartSettings>, b: Readonly<ChartSettings>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (key === 'colorPresetSettings') {
      if (JSON.stringify(a.colorPresetSettings) !== JSON.stringify(b.colorPresetSettings)) {
        return false
      }
      continue
    }
    if (!Object.is(a[key], b[key])) return false
  }
  return true
}

export function createSettingsState(initial?: Partial<ChartSettings>) {
  const { signals, readonly } = createSubState({
    settings: snapshotSettings(initial) as Readonly<ChartSettings>,
  })

  const write = (next: Readonly<ChartSettings>) => {
    if (settingsEqual(signals.settings.peek(), next)) return
    signals.settings.set(next)
  }

  return {
    readonly,
    actions: {
      replace(partial?: Partial<ChartSettings>) {
        write(snapshotSettings(partial))
      },
      patch(partial: Partial<ChartSettings>) {
        const merged = { ...signals.settings.peek(), ...partial }
        write(snapshotSettings(merged))
      },
    },
    dispose() {
      batch(() => {
        signals.settings.set(snapshotSettings({}))
      })
    },
  }
}

export type SettingsStateModule = ReturnType<typeof createSettingsState>
```

Note: if `deepFreezeSnapshot` does not throw on assignment in all envs, assert `Object.isFrozen(snap)` instead of toThrow in the test.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/settingsState.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/state/settingsState.ts packages/core/src/engine/state/__tests__/settingsState.test.ts
git commit -m "feat(core): add settingsState for ChartSettings SSOT"
```

---

## Task 2: B1 — Wire kernel + Chart + renderer + interaction

**Files:**
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/state/index.ts`
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/engine/render/chartRenderer.ts`
- Modify: `packages/core/src/engine/controller/interaction.ts`
- Modify: `packages/core/src/engine/__tests__/chart.dpr.test.ts` (or new glue test)

- [ ] **Step 1: Compose settings in ChartStateKernel**

In constructor after theme (or before drawing):

```ts
this.settings = createSettingsState()
// in signals bag:
settings: this.settings.readonly.settings,
// dispose:
this.settings.dispose()
```

Do **not** add a flat `actions.setSettings` that skips Chart side effects; Chart owns `updateSettings`.

Export type + re-export from `state/index.ts`.

- [ ] **Step 2: Inject settings$ into ChartRenderer**

Remove:

```ts
private settings: ChartSettings = {}
```

Add deps field:

```ts
settings$: ReadonlySignal<ChartSettings>
```

Replace `this.settings` reads with `this.deps.settings$.peek()` (or local helper `private get settings() { return this.deps.settings$.peek() }`).

Change:

```ts
getSettings(): ChartSettings {
  return this.deps.settings$.peek()
}
// delete updateSettings method OR make it throw / no-op deprecated
```

Chart constructor renderer deps:

```ts
settings$: this.kernel.settings.readonly.settings,
```

- [ ] **Step 3: Inject settings$ into InteractionController**

Same pattern: drop private bag; constructor takes `settings$: ReadonlySignal<ChartSettings>` or read from kernel via chart; replace `this.settings.X` with peek.

Remove `updateSettings` dual copy; Chart no longer calls it.

- [ ] **Step 4: Rewrite Chart.updateSettings**

```ts
updateSettings(settings: ChartSettings): void {
  this.kernel.settings.actions.replace(settings)
  // B2 will own rightAxisType projection fully; for B1 keep temporary
  // project to PriceScale as today until Task 5 lands:
  if ('rightAxisType' in settings) {
    const axisType = settings.rightAxisType as string
    if (axisType !== 'none') {
      for (const renderer of this.paneRenderers) {
        const pane = renderer.getPane()
        const scaleType =
          axisType === 'percent' && pane.role !== 'price' ? 'linear' : (axisType as ScaleType)
        pane.yAxis.setScaleType(scaleType)
      }
    }
  }
  this.scheduleDraw()
}
```

- [ ] **Step 5: Glue test**

```ts
it('updateSettings writes kernel settings only (no dual plain bag)', () => {
  // arrange chart with kernel
  chart.updateSettings(resolveSettings({ showGridLines: false }))
  expect(chart.kernel.settings.readonly.settings.peek().showGridLines).toBe(false)
  expect(chart.renderer.getSettings().showGridLines).toBe(false)
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/settingsState.test.ts src/engine/__tests__/chart.dpr.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: PASS

- [ ] **Step 7: Acceptance grep**

```bash
rg "private settings: ChartSettings" packages/core
```

Expected: no matches

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/engine/state packages/core/src/engine/chart.ts packages/core/src/engine/render/chartRenderer.ts packages/core/src/engine/controller/interaction.ts packages/core/src/engine/__tests__
git commit -m "refactor(core): project ChartSettings from settingsState SSOT"
```

---

## Task 3: B4 — Expand drawingState to DrawingToolId

**Files:**
- Modify: `packages/core/src/engine/state/drawingState.ts`
- Modify: `packages/core/src/engine/state/__tests__/drawingState.test.ts`
- Modify: `packages/core/src/engine/state/chartStateKernel.ts` (import type)

- [ ] **Step 1: Failing tests for DrawingToolId**

```ts
it('defaults drawingTool to cursor', () => {
  const d = createDrawingState()
  expect(d.readonly.drawingTool.peek()).toBe('cursor')
})

it('setDrawingTool accepts DrawingToolId', () => {
  const d = createDrawingState()
  d.actions.setDrawingTool('trend-line')
  expect(d.readonly.drawingTool.peek()).toBe('trend-line')
})
```

- [ ] **Step 2: Change drawingState**

```ts
import type { DrawingToolId } from '../drawing/toolConfig'

// initial:
drawingTool: 'cursor' as DrawingToolId,

setDrawingTool(tool: DrawingToolId) {
  if (signals.drawingTool.peek() === tool) return
  signals.drawingTool.set(tool)
},

// dispose:
signals.drawingTool.set('cursor')
```

Fix all compile errors from old `DrawingToolType | null` in kernel flat actions.

- [ ] **Step 3: Run drawingState tests PASS**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/drawingState.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(core): store DrawingToolId in drawingState"
```

---

## Task 4: B4 — Chart sole tool write + DrawingInteraction session

**Files:**
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/engine/drawing/interaction.ts`
- Modify: `packages/core/src/controllers/types.ts`
- Modify: `packages/core/src/controllers/createChartController.ts`
- Modify: `packages/vue/src/composables/chart/useDrawingManager.ts`
- Modify: mocks if needed (`packages/vue/src/__tests__/_mockController.ts`)

- [ ] **Step 1: Extend DrawingChartAdapter**

```ts
// controllers/types.ts
import type { DrawingToolId } from '../engine/drawing/toolConfig'

export interface DrawingChartAdapter {
  // ...existing...
  setDrawingToolId(toolId: DrawingToolId): void
  getDrawingToolId(): DrawingToolId
}
```

- [ ] **Step 2: Chart.setDrawingTool (engine)**

```ts
private drawingSession: DrawingInteractionController | null = null

registerDrawingSession(session: DrawingInteractionController | null): void {
  this.drawingSession = session
  if (session) {
    session.applyToolFromKernel(this.kernel.drawing.readonly.drawingTool.peek())
  }
}

setDrawingTool(tool: DrawingToolId): void {
  this.kernel.drawing.actions.setDrawingTool(tool)
  this.drawingSession?.applyToolSession(tool)
  this.scheduleDraw()
}
```

Remove obsolete TODO comment about “when Chart supports tool switch”.

- [ ] **Step 3: DrawingInteractionController**

```ts
// remove: private activeTool
// add:

getActiveTool(): DrawingToolId {
  return this.adapter.getDrawingToolId()
}

/** Only Chart may call after kernel write — session side effects */
applyToolSession(toolId: DrawingToolId): void {
  this.anchorCollector.reset()
  this.drawingState.removePreview()
  this.dragHandler.endDrag()
  this.setSelected(null)
  this.callbacks.onToolChange?.(toolId)
}

/** @deprecated external — prefer Chart.setDrawingTool */
setTool(toolId: DrawingToolId): void {
  this.adapter.setDrawingToolId(toolId)
}
```

Replace all internal `this.activeTool` reads with `this.getActiveTool()`.

- [ ] **Step 4: Controller + Vue**

`createChartController`:

```ts
function setDrawingToolId(toolId: DrawingToolId): void {
  if (disposed) return
  chart.setDrawingTool(toolId)
}
function getDrawingToolId(): DrawingToolId {
  return chart.kernel.drawing.readonly.drawingTool.peek()
}
// expose on controller; implement adapter methods used by DrawingInteractionController
```

`useDrawingManager`:

```ts
function handleSelectTool(toolId: string) {
  ctrl.value?.setDrawingToolId(toolId as DrawingToolId)
  // if registerDrawingSession not yet called, setupDrawing should register
}
```

In `setupDrawing`, after creating controller:

```ts
// if Chart has registerDrawingSession via controller:
chartCtrl.registerDrawingSession?.(drawingController.value)
// or cast to access chart — prefer explicit controller method
```

If Chart is not exposed, add `chartCtrl.attachDrawingSession(session)` on ChartController that calls `chart.registerDrawingSession`.

- [ ] **Step 5: Tests**

```ts
it('setDrawingTool updates kernel and session getActiveTool', () => {
  chart.setDrawingTool('h-line')
  expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('h-line')
})
```

Vue: mock controller gains `setDrawingToolId` / `getDrawingToolId`.

- [ ] **Step 6: Run core + vue tests**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/drawingState.test.ts src/engine/__tests__/chart.dpr.test.ts
pnpm --filter @363045841yyt/klinechart exec vitest run
```

- [ ] **Step 7: Commit**

```bash
git commit -am "fix(core): single engine write path for DrawingToolId"
```

---

## Task 5: B2 — paneScaleTypes in paneState

**Files:**
- Modify: `packages/core/src/engine/state/paneState.ts`
- Modify: `packages/core/src/engine/state/__tests__/paneState.test.ts` (or create)
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/chart.ts`

- [ ] **Step 1: Extend paneState**

```ts
import type { ScaleType } from '../utils/tickPosition'
import { immutableMap } from './immutable' // or Object.freeze(new Map)

// signals:
paneScaleTypes: immutableMap(new Map<string, ScaleType>()),

actions: {
  setPaneScaleType(paneId: string, scaleType: ScaleType) {
    const prev = signals.paneScaleTypes.peek()
    if (prev.get(paneId) === scaleType) return
    const next = new Map(prev)
    next.set(paneId, scaleType)
    signals.paneScaleTypes.set(immutableMap(next))
  },
  replacePaneScaleTypes(types: ReadonlyMap<string, ScaleType>) {
    signals.paneScaleTypes.set(immutableMap(new Map(types)))
  },
  removePaneScaleType(paneId: string) {
    const prev = signals.paneScaleTypes.peek()
    if (!prev.has(paneId)) return
    const next = new Map(prev)
    next.delete(paneId)
    signals.paneScaleTypes.set(immutableMap(next))
  },
}
```

If `immutableMap` helper missing, use `Object.freeze(new Map(...))` pattern from markerState.

- [ ] **Step 2: Unit tests** set/replace/remove/equal-skip

- [ ] **Step 3: Chart helpers**

```ts
private projectPaneScaleTypes(): void {
  const types = this.kernel.pane.readonly.paneScaleTypes.peek()
  for (const renderer of this.paneRenderers) {
    const pane = renderer.getPane()
    const t = types.get(pane.id) ?? 'linear'
    if (pane.yAxis.getScaleType() !== t) pane.yAxis.setScaleType(t)
  }
}

private applyRightAxisTypeToKernel(axisType: string): void {
  if (axisType === 'none') return
  const next = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
  for (const renderer of this.paneRenderers) {
    const pane = renderer.getPane()
    const scaleType =
      axisType === 'percent' && pane.role !== 'price' ? 'linear' : (axisType as ScaleType)
    next.set(pane.id, scaleType)
  }
  this.kernel.pane.actions.replacePaneScaleTypes(next)
  this.projectPaneScaleTypes()
}
```

`updateSettings`:

```ts
this.kernel.settings.actions.replace(settings)
if ('rightAxisType' in settings) {
  this.applyRightAxisTypeToKernel(settings.rightAxisType as string)
}
this.scheduleDraw()
```

- [ ] **Step 4: setActiveMode snapshot uses kernel map**

When entering timeshare, save:

```ts
scaleTypes: new Map(this.kernel.pane.readonly.paneScaleTypes.peek()),
```

When exiting:

```ts
this.kernel.pane.actions.replacePaneScaleTypes(saved.scaleTypes)
this.projectPaneScaleTypes()
// then clear basePrice as today
```

- [ ] **Step 5: createSubPane / removeSubPane** — ensure new panes get default linear in map; remove drops key (may need hooks in kernel.actions.createSubPane already in chartStateKernel — extend there).

- [ ] **Step 6: Tests + commit**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/paneState.test.ts src/engine/__tests__/chart.dpr.test.ts
git commit -am "feat(core): own paneScaleTypes in paneState SSOT"
```

---

## Task 6: B3 — modeState

**Files:**
- Create: `packages/core/src/engine/state/modeState.ts`
- Create: `packages/core/src/engine/state/__tests__/modeState.test.ts`
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/chart.ts`
- Optional: expose on controller

- [ ] **Step 1: Implement modeState**

```ts
import { createSubState } from '../../foundation/reactivity/signal'

export type ChartModeId = 'kline' | 'timeshare'

export function createModeState() {
  const { signals, readonly } = createSubState({
    chartMode: 'kline' as ChartModeId,
  })
  return {
    readonly,
    actions: {
      setChartMode(mode: ChartModeId) {
        if (signals.chartMode.peek() === mode) return
        signals.chartMode.set(mode)
      },
    },
    dispose() {
      signals.chartMode.set('kline')
    },
  }
}
```

- [ ] **Step 2: Wire kernel signals.chartMode**

- [ ] **Step 3: setActiveMode end**

After successful `_activeMode = mode` and activate:

```ts
const id: ChartModeId = mode === this._timeShareMode ? 'timeshare' : 'kline'
this.kernel.mode.actions.setChartMode(id)
```

Early-return if handler same **and** kernel already matches.

- [ ] **Step 4: Tests**

```ts
it('setActiveMode updates kernel chartMode', () => {
  chart.setActiveMode(chart /* access timeshare mode via public API if any */)
  // use switchToTimeShareForDate if that is the public path
  expect(chart.kernel.mode.readonly.chartMode.peek()).toBe('timeshare')
})
```

Prefer public API that already switches mode rather than private fields.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): track chartMode id in modeState"
```

---

## Task 7: Docs + final verification

**Files:**
- Modify: `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md`
- Optional: short note in day summary if repo keeps them

- [ ] **Step 1: PRD status block**

```markdown
## Phase B — residual business SSOT (2026-07-15)
- [x] B1 settingsState
- [x] B2 paneScaleTypes
- [x] B3 chartMode id
- [x] B4 DrawingToolId engine single write path
```

- [ ] **Step 2: Full package tests**

```bash
pnpm --filter @363045841yyt/klinechart-core test
pnpm --filter @363045841yyt/klinechart exec vitest run
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: all green

- [ ] **Step 3: Grep gates**

```bash
rg "private settings: ChartSettings" packages/core
rg "private activeTool" packages/core/src/engine/drawing
rg "updateSettings\(settings\)" packages/core/src/engine/render packages/core/src/engine/controller
```

Expected: no dual-write leftovers (session apply methods OK)

- [ ] **Step 4: Commit docs**

```bash
git add .opencode/plans/2026-07-15-statekernel-remaining-PRD.md docs/superpowers
git commit -m "docs: mark kernel B-class residual SSOT complete"
```

---

## Self-Review (plan vs spec)

| Spec section | Tasks |
|--------------|-------|
| B1 settingsState | Task 1–2 |
| B2 paneScaleTypes | Task 5 |
| B3 modeState | Task 6 |
| B4 DrawingToolId path | Task 3–4 |
| Order B1→B4→B2→B3 | Tasks ordered |
| Non-goals (toolbar, offset, dual-path) | Not in tasks |
| Theme dual documented | Task 2 notes; no merge |
| Success greps | Task 2 step 7, Task 7 step 3 |

**Placeholder scan:** none intentional.  
**Type consistency:** `DrawingToolId` from `toolConfig.ts`; `ChartModeId` = `'kline' \| 'timeshare'`; `ScaleType` from `tickPosition.ts`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-kernel-b-class-settings-mode-tool.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans checkpoints  

Which approach?
