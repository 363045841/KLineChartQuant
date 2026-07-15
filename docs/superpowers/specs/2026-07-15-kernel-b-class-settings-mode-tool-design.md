# Design: Kernel B-Class Residual SSOT (Settings / ScaleType / ChartMode / DrawingTool)

**Date:** 2026-07-15  
**Branch:** `feat/vue-reactivity-scroll`  
**Status:** Draft for review  
**Source audit:** StateKernel remaining inventory (B1–B4)  
**Principles:** AGENTS.md StateKernel five rules (SSOT, computed, R/W split, effect isolation, batch)

---

## 1. Goal

Close the four business-state gaps that still live outside `ChartStateKernel` after P0–P2:

| ID | Gap | Today | Target |
|----|-----|-------|--------|
| **B1** | `ChartSettings` | Plain copies on `ChartRenderer` + `InteractionController` | `settingsState` SSOT; consumers read `ReadonlySignal` |
| **B2** | Per-pane `scaleType` | Only on `PriceScale` fields; fanned from `rightAxisType` / mode restore | Kernel owns `paneScaleTypes`; `PriceScale` is runtime projector |
| **B3** | Chart mode | `Chart._activeMode` handler ref only | Kernel owns `'kline' \| 'timeshare'`; Chart keeps ModeHandler instances + side effects |
| **B4** | Drawing tool | Kernel legacy `DrawingToolType` unused by real tools; `DrawingInteractionController.activeTool` is real path | Kernel owns full `DrawingToolId`; Chart is sole engine write entry |

**Delivery:** Continuous commits on current branch; one PR at the end.

---

## 2. Non-Goals

- Toolbar / `LeftToolbar` local `selectedToolId` UI state (may mirror kernel later; not this design).
- `createDrawingController` / `createToolbarController` feature controllers (keep own Signals).
- `PriceScale` session fields: `priceOffset`, `verticalScale`, `basePrice`, log formula (interaction / frame runtime).
- `DrawingState` class local array removal (P2 optional A).
- `resizePaneBoundary` full pure-ize (P2 optional).
- Rendering dual-path merge (separate perf PR).
- npm scope rename.
- Vue `localStorage` settings persistence (stays UI-owned; still enters chart via `updateSettingsFacade`).

---

## 3. Architecture Overview

```
UI / Controller facade
        │
        ▼
Chart public API  ── sole mutation entry for B1–B4 domain writes
        │  kernel.actions / sub-state actions
        │  + coordinated side effects (scale project, mode handlers, tool session)
        │  + scheduleDraw
        ▼
ChartStateKernel
  ├── settings   (B1)  ChartSettings resolved snapshot
  ├── pane       (B2)  + paneScaleTypes: ReadonlyMap<paneId, ScaleType>
  ├── mode       (B3)  chartMode: 'kline' | 'timeshare'
  └── drawing    (B4)  drawingTool: DrawingToolId  (expanded type)
        │
        │  ReadonlySignal
        ▼
Projectors / runtime
  ChartRenderer.settings$        (no private settings bag)
  InteractionController.settings$
  PriceScale.scaleType           (projected from kernel, not SSOT)
  ModeHandler instances          (Chart-owned, selected by mode id)
  DrawingInteractionController   (session: anchors/preview/drag; tool id from kernel)
```

**Invariant:** No dual-write of the same business field to both kernel and a Manager plain field. Managers may hold frame/session state only.

---

## 4. B1 — `settingsState`

### 4.1 Module

**New file:** `packages/core/src/engine/state/settingsState.ts`

```ts
// Shape (conceptual)
{
  readonly: { settings: ReadonlySignal<Readonly<ChartSettings>> }
  actions: {
    /** Full replace after resolveSettings(partial) — primary public path */
    replace(partial?: Partial<ChartSettings>): void
    /** Merge patch onto current resolved, then resolve again */
    patch(partial: Partial<ChartSettings>): void
  }
  dispose(): void
}
```

- Storage: one signal holding **fully resolved** settings (`resolveSettings` from `foundation/config/chartSettings.ts`).
- Snapshots: `deepFreezeSnapshot` (or freeze top-level + nested `colorPresetSettings`).
- Equal-skip: if shallow equality on known `DEFAULT_SETTINGS` keys + `colorPresetSettings` reference/value equality, skip `.set()`.
- Initial: `resolveSettings({})` at kernel construct; Chart may immediately `replace` from mount options.

### 4.2 Kernel wiring

- `ChartStateKernel` adds `this.settings = createSettingsState()`.
- Flat bag: `signals.settings`, no flat “write settings” action that bypasses Chart side effects for `rightAxisType` (same pattern as customMarkers: Chart API is the mutation entry when side effects exist).
- Optional flat action only if Chart side effects are fully expressed inside kernel (they are not for axis projection) → **prefer Chart-only write entry**.

### 4.3 Chart / consumers

| Before | After |
|--------|-------|
| `Chart.updateSettings` → renderer + interaction plain copies | `kernel.settings.actions.replace(settings)` then project `rightAxisType` → B2, then `scheduleDraw` |
| `ChartRenderer.private settings` | `settings$: ReadonlySignal`; `getSettings()` peeks signal |
| `InteractionController.private settings` | same injection; `disableMainPaneVerticalScroll` etc. from peek |

**Renderer deps:** add `settings$: ReadonlySignal<ChartSettings>` next to existing `drawings$` pattern.

**Theme relationship:** `settings.theme` may be `'light' \| 'dark' \| 'auto'`; `themeState` remains effective resolved theme (`'light' \| 'dark'`). This design **does not merge** them. Chart/Vue continues to call `setTheme` for effective theme; settings dialog may still emit theme preference — existing behavior preserved unless a later task wires `auto`. Document as known dual: preference vs effective.

### 4.4 Tests / acceptance

- Unit: replace/patch/freeze/equal-skip.
- Integration: `updateSettings` updates one signal; renderer `getSettings()` and interaction reads match.
- Acceptance: `rg "private settings: ChartSettings" packages/core` → empty.

---

## 5. B2 — Per-pane `scaleType`

### 5.1 Domain split

| Field | Owner | Rationale |
|-------|-------|-----------|
| `scaleType` per pane | **Kernel** (`paneScaleTypes`) | User/domain axis mode; restored across timeshare |
| `priceOffset`, `verticalScale`, `basePrice`, logFormula | **PriceScale runtime** | Gesture/session; high churn |

### 5.2 Storage

Extend `paneState` (same commit batch as layout when needed):

```ts
paneScaleTypes: ReadonlyMap<string, ScaleType>  // ScaleType = 'linear' | 'log' | 'percent'
```

- Actions: `setPaneScaleType(paneId, type)`, `replacePaneScaleTypes(map)`, `removePaneScaleType(paneId)` (on pane remove).
- `commitLayout` does **not** clear scale types for surviving panes; new panes default to `'linear'` unless settings projection says otherwise.

### 5.3 Write paths

1. **`Chart.updateSettings` when `rightAxisType` present**  
   - Write settings (B1).  
   - For each known pane:  
     - if `rightAxisType === 'none'`: do not change scale types (axis visibility is separate; keep current behavior: only apply when `axisType !== 'none'`).  
     - else: `scaleType = (percent && role !== 'price') ? 'linear' : axisType`.  
   - `batch` kernel `replacePaneScaleTypes` or per-pane sets.  
   - Project to each `pane.yAxis.setScaleType`.

2. **Timeshare enter/exit** (`setActiveMode`)  
   - Enter timeshare: snapshot current `paneScaleTypes` into `_savedTimeShareState.scaleTypes` (session bag on Chart — allowed, like today).  
   - Exit timeshare: restore map into kernel then project to PriceScale.  
   - Prefer reading/writing kernel map instead of only PriceScale fields when snapshotting.

3. **Pane create/remove**  
   - New pane: default `'linear'` (or derive from current `rightAxisType` for price panes).  
   - Remove: drop key from map.

### 5.4 Read / project

- Render path continues `pane.yAxis.getScaleType()` for frame math (after projection).  
- Single projector helper: `projectPaneScaleTypes(kernelMap → paneRenderers)`.  
- No long-lived second SSOT: after any kernel write, project immediately (same frame as `commitLayout` pattern).

### 5.5 Tests / acceptance

- settings `rightAxisType: 'log'` → all price panes log; indicator panes not percent.  
- timeshare round-trip restores scale types from saved kernel snapshot path.  
- Acceptance: business scale type changes always go through `pane.actions` or documented Chart entry that writes kernel first.

---

## 6. B3 — Chart mode id

### 6.1 Module

**New:** `packages/core/src/engine/state/modeState.ts` (small)

```ts
chartMode: 'kline' | 'timeshare'  // default 'kline'
actions.setChartMode(mode)
```

Alternatively embed in `dataManagerState` if preferred for locality; **prefer dedicated `modeState`** for clarity (mode is not data-manager coordination).

### 6.2 Chart responsibilities (unchanged side effects)

`Chart` still owns:

- `_kLineMode` / `_timeShareMode` handler instances  
- `_savedTimeShareState` session snapshot (zoom, indicators, subPanes, scaleTypes)  
- `onActivate` / `onDeactivate` renderer/indicator toggles  

`setActiveMode(handler)` becomes:

1. Resolve mode id from handler identity (`handler === _timeShareMode ? 'timeshare' : 'kline'`).  
2. If same as `kernel.mode.readonly.chartMode.peek()`, return.  
3. Run existing save/restore / deactivate / activate sequence.  
4. **`kernel.mode.actions.setChartMode(id)`** in the same logical transition (batch with related writes where already batched).  
5. Prefer: set kernel mode **after** successful transition side effects, or **before** if consumers must see target mode mid-transition — **choose after side effects succeed** to avoid false mode if activate throws (rare). Document choice: **write kernel after handler swap succeeds**.

Public read:

- `chart.chartMode` / controller signal from kernel.  
- `chart.activeMode` still returns handler for engine internals.

### 6.3 Tests / acceptance

- switch kline ↔ timeshare updates kernel signal.  
- existing timeshare restore behavior green.  
- Acceptance: no business consumer keys off `Chart._activeMode` private field; optional later expose readonly signal on controller.

---

## 7. B4 — Drawing tool single engine path

### 7.1 Type migration (critical)

Two incompatible types exist today:

| Type | Values | Used by |
|------|--------|---------|
| `DrawingToolType` (chartTypes / controller types) | `'trendline' \| 'horizontal' \| 'fib' \| 'rectangle' \| 'arrow'` | kernel `drawingTool`, `Chart.setDrawingTool`, legacy controller API |
| `DrawingToolId` (toolConfig) | `'cursor' \| 'trend-line' \| …` full set | `DrawingInteractionController`, Vue toolbar |

**Decision:** Kernel and Chart public engine path use **`DrawingToolId`**.

- Default: `'cursor'` (not `null`).  
- `null` may remain on **legacy** `ChartController.setDrawingTool(DrawingToolType | null)` mapped to cursor / best-effort legacy map for AI/runtime compatibility.  
- Prefer expanding controller surface: add `setDrawingToolId(id: DrawingToolId)` or change signal type with a documented breaking note if package not yet published widely — **this monorepo can change together**.

**Legacy map (controller only):** keep `mapDrawingTool` for old enum if external AI tools still send `drawing.setTool` with legacy names; ai-runtime schemas should be audited to prefer `DrawingToolId`.

### 7.2 Write path

```
Vue handleSelectTool(toolId)
  → ChartController.setDrawingToolId(toolId)   // or unified setDrawingTool after type expand
  → Chart.setDrawingTool(toolId)
       1. kernel.drawing.actions.setDrawingTool(toolId)
       2. registered DrawingSession.applyTool(toolId)
            // clear anchors, preview, drag, selection (today setTool body)
       3. scheduleDraw if needed
```

**`DrawingInteractionController`:**

- `setTool` becomes either:  
  - **(A)** private/session-only `applyToolSession(toolId)` called only from Chart, or  
  - **(B)** public but **must** call adapter → Chart (forbidden to only set local field).  
- **Choose A** for SSOT clarity: external callers use Chart/Controller only.  
- Vue `useDrawingManager.handleSelectTool` switches from `drawingController.setTool` to `chartCtrl.setDrawingToolId`.  
- Local `activeTool` field: remove; `getActiveTool()` peeks kernel via adapter `getDrawingTool()` or injected signal.

**Adapter extension (`DrawingChartAdapter`):**

```ts
setDrawingTool(toolId: DrawingToolId): void
getDrawingTool(): DrawingToolId
// or expose readonly signal if adapter can carry signals
```

### 7.3 Kernel `drawingState`

```ts
drawingTool: 'cursor' as DrawingToolId  // was DrawingToolType | null
actions.setDrawingTool(tool: DrawingToolId)
```

Dispose resets to `'cursor'`.

### 7.4 Tests / acceptance

- set tool via Chart updates kernel; `DrawingInteractionController.getActiveTool()` matches.  
- tool switch clears preview/selection (session behavior preserved).  
- Vue path does not leave kernel stuck on old tool.  
- Acceptance: no engine write of tool without kernel update; `rg "private activeTool" packages/core/src/engine/drawing` → empty (or only if proven pure cache of kernel peek — prefer empty).

---

## 8. Implementation Order (same branch)

Recommended commit sequence (each green tests):

1. **B1** settingsState + renderer/interaction inject + Chart.updateSettings  
2. **B4** DrawingToolId in kernel + Chart session apply + Vue handleSelectTool  
3. **B2** paneScaleTypes + project from settings/mode  
4. **B3** modeState + setActiveMode kernel write  
5. Docs: update `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` status for B-class  

Rationale: B1 removes dual plain bags first; B4 fixes dead kernel tool path used by product UI; B2 depends on settings write path; B3 is small and touches mode switch already writing scale snapshots (after B2 cleaner).

---

## 9. File Impact Map

| Path | Change |
|------|--------|
| `engine/state/settingsState.ts` | **Create** |
| `engine/state/modeState.ts` | **Create** |
| `engine/state/paneState.ts` | + `paneScaleTypes` |
| `engine/state/drawingState.ts` | `DrawingToolId` |
| `engine/state/chartStateKernel.ts` | compose settings + mode; dispose; signals |
| `engine/state/index.ts` | exports |
| `engine/chart.ts` | updateSettings / setActiveMode / setDrawingTool / register drawing session |
| `engine/render/chartRenderer.ts` | settings$ inject |
| `engine/controller/interaction.ts` | settings$ inject |
| `engine/drawing/interaction.ts` | session apply; no private tool SSOT |
| `engine/drawing/DrawingState.ts` | unchanged contract (optional later) |
| `controllers/types.ts` + `createChartController.ts` | tool API + settings/mode signals as needed |
| `vue/.../useDrawingManager.ts` | select tool via controller/chart |
| `engine/state/__tests__/*` | new unit tests |
| `engine/__tests__/chart.dpr.test.ts` or focused tests | glue |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `DrawingToolType` vs `DrawingToolId` break AI/public API | Dual-map at controller; audit ai-runtime; prefer expand types in monorepo |
| settings `theme` vs `themeState` confusion | Document dual; no silent merge in B1 |
| scale project miss on new pane | Default + project on createSubPane / layout add |
| mode signal mid-transition | Write kernel after successful handler swap |
| Drawing session not registered when setTool early | Chart no-ops session apply; kernel still updates; setupDrawing later syncs from kernel |

---

## 11. Success Criteria

- [ ] No `private settings: ChartSettings` on renderer/interaction  
- [ ] `paneScaleTypes` is sole business owner of per-pane scale type  
- [ ] `chartMode` signal tracks kline/timeshare  
- [ ] Real drawing tools (DrawingToolId) live in kernel; Vue tool select updates kernel  
- [ ] `pnpm --filter @363045841yyt/klinechart-core test` + vue unit tests green  
- [ ] AGENTS five principles: no dual business write, actions-only mutation, freeze snapshots  

---

## 12. Open Points (resolved in this design)

| Question | Resolution |
|----------|------------|
| Settings shape | Independent `settingsState` |
| Scale depth | `scaleType` only |
| Mode depth | mode id only |
| Tool boundary | Engine single path; toolbar UI local OK |
| Delivery | Same branch, one final PR |
| Implementation order | B1 → B4 → B2 → B3 |
