# Design: SSOT Cleanup C — Drawing Read Boundary / Vue Tool Split / Theme Merge

**Date:** 2026-07-15  
**Branch:** `feat/vue-reactivity-scroll`  
**Status:** Draft for review  
**Depends on:** B-class residual SSOT (`settings` / `paneScaleTypes` / `chartMode` / `DrawingToolId`)  
**Principles:** AGENTS.md StateKernel five rules

---

## 1. Goal

Close residual **Important** SSOT gaps after B-class:

| ID | Gap | Target |
|----|-----|--------|
| **C1** | Drawing session selection dual + mutable `getAll` + stub `removeDrawing` | Selection only kernel; defensive copies on read; full remove API |
| **C2** | Vue `activeToolId` dual with kernel `drawingTool` | Drawing tools mirror kernel; `range-select` independent local mode |
| **C3** | `settings.theme` vs `themeState` dual | Preference only in `settings.theme`; effective `light\|dark` is computed |
| **C4** | Scale triple semantics undocumented | Spec documents preference → kernel map → PriceScale runtime |

**Delivery:** Continuous commits on current branch; one PR with B + C at end.

---

## 2. Non-Goals

- Drop DrawingState local `drawings[]` entirely (still intentional work-copy).
- Put `range-select` into `DrawingToolId` enum.
- Merge toolbar/feature controllers into ChartStateKernel.
- Rendering dual-path merge.
- Force Vue `chartSettings` to be the only UI state without localStorage (localStorage stays UI-owned; must push via `updateSettingsFacade`).

---

## 3. Architecture

```
┌─ C1 Drawing ─────────────────────────────────────────────┐
│ Chart.setDrawings / setSelected / removeDrawing          │
│   → kernel.drawing only                                  │
│ DrawingState: mutable work-copy for CRUD/drag            │
│   selection: adapter get/set only (no local field)       │
│   getAll(): return copy                                  │
│ DrawingStore: still ReadonlySignal projector             │
└──────────────────────────────────────────────────────────┘

┌─ C2 Vue tool ────────────────────────────────────────────┐
│ ctrl.drawingTool  ──subscribe──► drawingToolId (UI)      │
│ isRangeSelectMode (local boolean)                        │
│ handleSelectTool:                                        │
│   range-select → set flag + setDrawingToolId('cursor')   │
│   else → clear flag + setDrawingToolId(id)               │
└──────────────────────────────────────────────────────────┘

┌─ C3 Theme ───────────────────────────────────────────────┐
│ settings.theme: 'light' | 'dark' | 'auto'   (preference) │
│ systemTheme:    'light' | 'dark'            (injected)   │
│ effectiveTheme: computed from preference + system        │
│ Render / CSS / setTheme consumers use effectiveTheme     │
│ themeState module removed as preference SSOT             │
└──────────────────────────────────────────────────────────┘

┌─ C4 Scale layers (document only) ────────────────────────┐
│ settings.rightAxisType  → preference / axis visibility   │
│ paneScaleTypes          → business scale mode per pane   │
│ PriceScale.scaleType    → projected runtime              │
└──────────────────────────────────────────────────────────┘
```

---

## 4. C1 — Drawing read boundary + removeDrawing

### 4.1 Selection

**Remove** `DrawingState.private selectedDrawingId`.

| API | Behavior |
|-----|----------|
| `getSelectedId()` | `adapter` must expose `getSelectedDrawingId(): string \| null` reading kernel |
| `getSelected()` | find in work-copy by kernel id |
| `setSelected(d)` | only `adapter.setSelectedDrawingId` |
| `setDrawings` / `replace` / `remove` / `clear` | clear selection via adapter when id missing (no local field) |

Extend `DrawingChartAdapter`:

```ts
getSelectedDrawingId(): string | null
```

Controller already has `selectedDrawingId` signal; implement adapter method as `peek()`.

### 4.2 Defensive reads

```ts
getAll(): DrawingObject[] {
  return this.drawings.slice() // shallow array copy; elements may still be shared
}
getNonPreview(): DrawingObject[] {
  return this.drawings.filter((d) => d.id !== PREVIEW_ID)
}
```

**Note:** Work-copy elements remain mutable for drag in-place updates via `addOrUpdate`. Callers must not long-term cache `getAll()` results as SSOT. Spec forbids mutating returned array structure; element mutation only through DrawingState write APIs.

Optional later: deep-freeze returned snapshots (not required this pass if slice is enough for “array not extensible” class bugs).

### 4.3 Chart.removeDrawing

```ts
removeDrawing(drawingId: string): void {
  const next = this.kernel.drawing.readonly.drawings
    .peek()
    .filter((d) => d.id !== drawingId)
  // setDrawings already clears invalid selection
  this.setDrawings(next)
}
```

Session path: `DrawingState.removeDrawing` already filters work-copy + adapter.setDrawings. After C1, session selection uses adapter only — keep that path; Chart public API must not be a stub.

When session is registered, prefer:

```ts
removeDrawing(id: string): void {
  if (this.drawingSession) {
    this.drawingSession.removeDrawing(id)
    return
  }
  // fallback kernel-only
  ...
}
```

`DrawingInteractionController.removeDrawing` already delegates to DrawingState — OK.

### 4.4 Tests

- DrawingState: no local selection field; setSelected only calls adapter.
- getAll() mutation of returned array does not extend internal list.
- Chart.removeDrawing removes from kernel + clears selection if needed.
- Vue delete path still works via session.

---

## 5. C2 — Vue tool split

### 5.1 State shape

Replace single `activeToolId` dual-use with:

| State | Owner | Values |
|-------|-------|--------|
| `drawingToolId` | Mirror of `ctrl.drawingTool` (kernel) | `DrawingToolId` |
| `isRangeSelectMode` | Vue local only | boolean |

### 5.2 handleSelectTool

```
if toolId === 'range-select':
  isRangeSelectMode = true
  ctrl.setDrawingToolId('cursor')
  clear selection if needed
else:
  isRangeSelectMode = false
  clearRangeSelection()
  ctrl.setDrawingToolId(toolId)
```

### 5.3 Consumers

- `useRangeSelection`: take `isRangeSelectMode` (or computed) instead of `activeToolId === 'range-select'`.
- LeftToolbar highlight: active if `isRangeSelectMode && toolId==='range-select'` OR `drawingToolId === toolId` (and group children).
- Subscribe `ctrl.drawingTool` on setup; initial sync from peek.

### 5.4 Non-goals

- Do not put `range-select` in kernel.
- Toolbar feature controller remains separate.

---

## 6. C3 — Theme merge into settings

### 6.1 Preference vs effective

| Signal | Type | Meaning |
|--------|------|---------|
| `settings.theme` | `'light' \| 'dark' \| 'auto'` | User preference (SSOT in settingsState) |
| `systemTheme` | `'light' \| 'dark'` | OS / media query (writable by adapter) |
| `effectiveTheme` | `'light' \| 'dark'` | **Computed** for all render/CSS |

### 6.2 Kernel changes

1. **Remove** `createThemeState` as preference bag (delete module or gut to nothing).
2. Add to `ChartStateKernel` (or small `createThemeProjection` helper):

```ts
systemTheme: WritableSignal<'light' | 'dark'>  // internal
// public:
effectiveTheme: computed(() => {
  const pref = settings.readonly.settings().theme
  if (pref === 'auto') return systemTheme()
  return pref === 'dark' ? 'dark' : 'light'
})
actions.setSystemTheme(t: 'light' | 'dark')  // adapter only
// setTheme(light|dark): settings.actions.patch({ theme: t })
// setThemeAuto(): settings.actions.patch({ theme: 'auto' })
```

3. Flat bag: `theme` signal becomes **`effectiveTheme`** (keep name `theme` for adapter compatibility so Vue `ctrl.theme` stays `light|dark`).
4. Dispose: drop themeState.dispose; reset systemTheme default `'light'`.

### 6.3 Chart API

```ts
setTheme(theme: 'light' | 'dark'): void {
  this.kernel.settings.actions.patch({ theme })
  this.scheduleDraw()
}
setThemePreference(theme: 'light' | 'dark' | 'auto'): void {
  this.kernel.settings.actions.patch({ theme })
  this.scheduleDraw()
}
setSystemTheme(theme: 'light' | 'dark'): void {
  this.kernel.actions.setSystemTheme(theme)
  // scheduleDraw only if preference is auto (effect isolation: optional effect)
  this.scheduleDraw()
}
get theme(): ReadonlySignal<'light' | 'dark'> {
  return this.kernel.effectiveTheme  // or signals.theme
}
```

Renderer `getTheme()` peeks effective theme (already does).

### 6.4 Vue `useChartTheme`

- On settings change with `theme: 'auto'`: call `setThemePreference('auto')` + register matchMedia → `setSystemTheme`.
- On settings change with light/dark: `setThemePreference` / `setTheme` + remove matchMedia.
- `chartTheme` ref: **subscribe `ctrl.theme`** (effective), not independent SSOT.
- `chartSettings` may still be local for dialog, but after apply must match kernel via facade; optional subscribe `ctrl.settings` for multi-source truth.

### 6.5 React / Angular

Same contract: `setTheme` writes preference light/dark; auto handled by host if they support it (Vue is primary host today).

### 6.6 Tests

- settings.theme auto + systemTheme dark → effective dark.
- setTheme('light') sets preference light and effective light.
- Renderer getTheme follows effective after patch.
- No remaining imports of createThemeState as SSOT.

### 6.7 Migration note

Default `settings.theme` already `'dark'` in DEFAULT_SETTINGS — effective starts dark unless mount opts override. Match prior `themeState` default `'light'`?  

**Decision:** Keep **DEFAULT_SETTINGS** (`dark`) as preference default; on Chart construct if mount `opts.theme` provided, patch settings. Document that effective default follows settings defaults, not old themeState `'light'`. If product needs light default, change DEFAULT_SETTINGS in same PR only if tests require — check Vue initialTheme props.

---

## 7. C4 — Scale three-layer semantics (docs)

| Layer | Store | Role |
|-------|-------|------|
| Preference | `settings.rightAxisType` | UI: none / linear / log / percent; also “hide right axis” when none |
| Business | `pane.paneScaleTypes` | Per-pane scale mode SSOT for kline; timeshare forces percent map |
| Runtime | `PriceScale.scaleType` + offset/basePrice | Frame math; projected from kernel; session transforms stay local |

**Write rules:**

1. User changes axis type → `updateSettings` → patch settings → `applyRightAxisTypeToKernel` → project.
2. Enter timeshare → replace map with percent → project; exit restore saved map.
3. Never treat `yAxis.getScaleType()` as long-term SSOT for persistence.
4. `rightAxisType === 'none'` does not clear paneScaleTypes (visibility vs scale mode).

---

## 8. Implementation order

1. **C1** Drawing selection + getAll copy + removeDrawing  
2. **C2** Vue tool split  
3. **C3** Theme merge (largest blast radius)  
4. **C4** Docs only (this spec section + PRD checkbox)  

---

## 9. File impact

| Path | Change |
|------|--------|
| `engine/drawing/DrawingState.ts` | drop local selection; copy on getAll |
| `engine/drawing/interaction.ts` | use getSelected via adapter |
| `controllers/types.ts` | `getSelectedDrawingId` on adapter |
| `controllers/createChartController.ts` | adapter method; theme APIs |
| `engine/chart.ts` | removeDrawing; theme APIs |
| `engine/state/themeState.ts` | remove or repurpose |
| `engine/state/chartStateKernel.ts` | effectiveTheme + systemTheme |
| `engine/state/settingsState.ts` | no structural change (theme already in ChartSettings) |
| `vue/.../useDrawingManager.ts` | tool via kernel if needed |
| `vue/.../useChartState.ts` | drop dual activeToolId or re-export split |
| `vue/.../useRangeSelection.ts` | isRangeSelectMode |
| `vue/.../KLineChart.vue` | handleSelectTool |
| `vue/.../useChartTheme.ts` | preference + system + subscribe effective |
| mocks / tests | theme + selection + removeDrawing |

---

## 10. Success criteria

- [ ] No `private selectedDrawingId` in DrawingState  
- [ ] `Chart.removeDrawing` mutates kernel (no console.warn stub)  
- [ ] Vue range mode does not invent a DrawingToolId  
- [ ] `createThemeState` preference bag gone; `ctrl.theme` is effective only  
- [ ] settings.theme auto works with systemTheme injection  
- [ ] Scale three-layer documented in this spec  
- [ ] core + vue unit tests green  

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Theme default light vs dark | Explicit DEFAULT_SETTINGS; test mount path |
| Drag mutates objects shared with getAll copy | getAll is shallow copy of array only; document; drag uses addOrUpdate |
| Selection lag if adapter not wired | Controller implements getSelectedDrawingId always |
| Auto theme without window | systemTheme stays last known / 'light' in SSR/tests |
