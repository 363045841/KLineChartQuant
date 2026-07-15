# SSOT Cleanup C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close residual Important SSOT gaps: drawing selection/read boundary + removeDrawing, Vue tool split for range-select, merge theme preference into settings with computed effectiveTheme, document scale layers.

**Architecture:** Keep DrawingState work-copy but selection only via kernel adapter; Vue mirrors kernel.drawingTool and owns range-select flag separately; remove themeState preference bag in favor of settings.theme + systemTheme → effectiveTheme computed.

**Tech Stack:** TypeScript, vitest (jsdom), Vue 3 composables, existing createSubState / computed / batch

**Spec:** `docs/superpowers/specs/2026-07-15-ssot-cleanup-C-design.md`

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `packages/core/src/engine/drawing/DrawingState.ts` | No local selection; getAll copy |
| `packages/core/src/engine/drawing/interaction.ts` | Selection via adapter |
| `packages/core/src/controllers/types.ts` | getSelectedDrawingId; theme APIs |
| `packages/core/src/controllers/createChartController.ts` | Adapter + expose theme/settings |
| `packages/core/src/engine/chart.ts` | removeDrawing; setTheme → settings; systemTheme |
| `packages/core/src/engine/state/chartStateKernel.ts` | effectiveTheme computed; drop themeState preference |
| `packages/core/src/engine/state/themeState.ts` | Delete or leave deprecated empty re-export |
| `packages/vue/src/composables/chart/useChartState.ts` | drawingToolId + isRangeSelectMode |
| `packages/vue/src/composables/chart/useRangeSelection.ts` | isRangeSelectMode input |
| `packages/vue/src/composables/chart/useChartTheme.ts` | preference + system + subscribe effective |
| `packages/vue/src/components/KLineChart.vue` | handleSelectTool split |
| Tests under `packages/core` / `packages/vue` | C1–C3 coverage |

---

## Task 1: C1 — DrawingState selection + getAll copy

**Files:**
- Modify: `packages/core/src/engine/drawing/DrawingState.ts`
- Modify: `packages/core/src/controllers/types.ts`
- Modify: `packages/core/src/controllers/createChartController.ts`
- Create/Modify: tests under `packages/core/src/engine/drawing/__tests__/`

- [ ] **Step 1: Extend DrawingChartAdapter**

```ts
// controllers/types.ts — inside DrawingChartAdapter
getSelectedDrawingId(): string | null
```

Implement on createChartController:

```ts
function getSelectedDrawingId(): string | null {
  if (disposed) return null
  return chart.kernel.drawing.readonly.selectedDrawingId.peek()
}
// return object includes getSelectedDrawingId
```

- [ ] **Step 2: Rewrite DrawingState selection**

Remove `private selectedDrawingId`.

```ts
getSelectedId(): string | null {
  return this.adapter.getSelectedDrawingId()
}

getSelected(): DrawingObject | null {
  const id = this.getSelectedId()
  if (!id) return null
  return this.drawings.find((d) => d.id === id) ?? null
}

setSelected(drawing: DrawingObject | null): void {
  const newId = drawing?.id ?? null
  if (this.adapter.getSelectedDrawingId() === newId) return
  this.adapter.setSelectedDrawingId(newId)
}

getAll(): DrawingObject[] {
  return this.drawings.slice()
}

// setDrawings / replaceDrawings / removeDrawing / clear:
// when selection invalid, only adapter.setSelectedDrawingId(null)
// do not keep local selected field
```

- [ ] **Step 3: Tests**

```ts
it('getAll returns a copy so push on result does not mutate internal', () => {
  const adapter = mockAdapter()
  const state = new DrawingState(adapter)
  state.setDrawings([mk('a')])
  const all = state.getAll()
  all.push(mk('hack'))
  expect(state.getAll()).toHaveLength(1)
})

it('setSelected only writes adapter, getSelectedId reads adapter', () => {
  const adapter = mockAdapter()
  let selected: string | null = null
  adapter.getSelectedDrawingId = () => selected
  adapter.setSelectedDrawingId = (id) => {
    selected = id
  }
  const state = new DrawingState(adapter)
  state.setDrawings([mk('a')])
  state.setSelected(mk('a'))
  expect(selected).toBe('a')
  expect(state.getSelectedId()).toBe('a')
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/drawing/__tests__
```

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(core): drawing selection SSOT via adapter and defensive getAll"
```

---

## Task 2: C1 — Chart.removeDrawing

**Files:**
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/engine/__tests__/chart.dpr.test.ts`

- [ ] **Step 1: Implement removeDrawing**

```ts
removeDrawing(drawingId: string): void {
  if (this.drawingSession) {
    this.drawingSession.removeDrawing(drawingId)
    return
  }
  const next = this.kernel.drawing.readonly.drawings
    .peek()
    .filter((d) => d.id !== drawingId)
  this.setDrawings([...next])
}
```

- [ ] **Step 2: Test**

```ts
it('removeDrawing drops id from kernel and clears selection', async () => {
  const chart = new Chart(createDom(1000, 600), defaultOptions)
  chart.setDrawings([/* d1, d2 plugin DrawingObject */])
  chart.setSelectedDrawingId('d1')
  chart.removeDrawing('d1')
  expect(chart.kernel.drawing.readonly.drawings.peek().map((d) => d.id)).toEqual(['d2'])
  expect(chart.kernel.drawing.readonly.selectedDrawingId.peek()).toBeNull()
  await chart.destroy()
})
```

Note: `setDrawings` already clears invalid selection in drawingState actions.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(core): implement Chart.removeDrawing via session or kernel"
```

---

## Task 3: C2 — Vue tool split

**Files:**
- Modify: `packages/vue/src/composables/chart/useChartState.ts`
- Modify: `packages/vue/src/composables/chart/useRangeSelection.ts`
- Modify: `packages/vue/src/components/KLineChart.vue`
- Modify: `packages/vue/src/composables/chart/useDrawingManager.ts` (if still needed)
- Grep all `activeToolId` usages and update

- [ ] **Step 1: useChartState**

```ts
// Replace activeToolId with:
const isRangeSelectMode = ref(false)
// drawing tool UI reads from controller signal in KLineChart — not stored here
return { ..., isRangeSelectMode }
```

- [ ] **Step 2: KLineChart wiring**

```ts
// after controller ready:
const drawingToolId = shallowRef('cursor')
watch/subscribe ctrl.drawingTool → drawingToolId

function handleSelectTool(toolId: string) {
  if (toolId === 'range-select') {
    isRangeSelectMode.value = true
    controller.value?.setDrawingToolId('cursor')
    selectedDrawingId.value = null
    return
  }
  isRangeSelectMode.value = false
  clearRangeSelection()
  handleDrawingToolSelect(toolId) // setDrawingToolId
}

// LeftToolbar selected highlight:
// isActive(tool) = tool.id === 'range-select' ? isRangeSelectMode
//   : !isRangeSelectMode && (drawingToolId === tool.id || children)
```

Pass `isRangeSelectMode` into `useRangeSelection` instead of `activeToolId`.

- [ ] **Step 3: useRangeSelection**

```ts
isRangeSelectMode: Ref<boolean>
// isRangeSelectActive = computed(() => isRangeSelectMode.value)
```

- [ ] **Step 4: Vue tests / manual path**

```bash
pnpm --filter @363045841yyt/klinechart exec vitest run
```

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(vue): split range-select mode from kernel drawingTool"
```

---

## Task 4: C3 — Theme merge into settings

**Files:**
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Delete or gut: `packages/core/src/engine/state/themeState.ts`
- Modify: `packages/core/src/engine/state/index.ts`
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/controllers/types.ts` + `createChartController.ts`
- Modify: `packages/vue/src/composables/chart/useChartTheme.ts`
- Modify: all mocks that set `theme` signal
- Tests: new `effectiveTheme` unit tests; update any themeState tests

- [ ] **Step 1: Kernel effectiveTheme**

In ChartStateKernel constructor after settings:

```ts
// remove: this.theme = createThemeState()
const systemTheme = /* createSubState or createSignal */ 'light' as 'light' | 'dark'

this.effectiveTheme$ = computed(() => {
  const pref = this.settings.readonly.settings().theme
  if (pref === 'auto') return systemThemeSignal()
  return pref === 'dark' ? 'dark' : 'light'
})

// signals.theme = this.effectiveTheme$  // keep key name "theme"
// actions.setTheme(light|dark) => settings.actions.patch({ theme })
// actions.setSystemTheme(t) => systemThemeSignal.set(t)
// dispose: no themeState
```

Implementation detail: use `createSubState({ systemTheme: 'light' })` private module inline or small `createSystemThemeState`.

- [ ] **Step 2: Chart API**

```ts
setTheme(theme: 'light' | 'dark'): void {
  this.kernel.settings.actions.patch({ theme })
  this.scheduleDraw()
}
setSystemTheme(theme: 'light' | 'dark'): void {
  this.kernel.actions.setSystemTheme?.(theme) // or kernel method
  this.scheduleDraw()
}
get theme(): ReadonlySignal<'light' | 'dark'> {
  return this.kernel.signals.theme as ReadonlySignal<'light' | 'dark'>
}
```

`getTheme` in renderer deps already peeks theme — now effective.

- [ ] **Step 3: Controller**

```ts
const themeSignal = chart.theme // effective
function setTheme(t: 'light' | 'dark') { chart.setTheme(t) }
function setSystemTheme(t: 'light' | 'dark') { chart.setSystemTheme(t) }
// expose setSystemTheme on ChartController types
```

- [ ] **Step 4: Vue useChartTheme**

```ts
// chartTheme: subscribe ctrl.theme (effective)
// applyThemeFromSettings:
//   if auto → setThemePreference via updateSettingsFacade with theme auto
//            + matchMedia → setSystemTheme
//   else → updateSettings / setTheme
// handleSettingsChange: update local chartSettings + facade + applyThemeFromSettings
// Remove independent chartTheme writes that bypass kernel
```

Add to ChartController:

```ts
setSystemTheme(theme: 'light' | 'dark'): void
// optional:
setThemePreference(theme: 'light' | 'dark' | 'auto'): void
```

Simplest path matching existing Vue:

```ts
if (themeSetting === 'auto') {
  chartCtrl.updateSettingsFacade(resolveSettings({ ...chartSettings, theme: 'auto' }))
  chartCtrl.setSystemTheme(mq.matches ? 'dark' : 'light')
  // listen change → setSystemTheme only
} else {
  chartCtrl.setTheme(themeSetting)
}
```

- [ ] **Step 5: Tests**

```ts
// settingsState / kernel test
it('effectiveTheme follows auto + systemTheme', () => {
  const k = new ChartStateKernel(...)
  k.settings.actions.patch({ theme: 'auto' })
  k.actions.setSystemTheme('dark')
  expect(k.signals.theme()).toBe('dark')
  k.settings.actions.patch({ theme: 'light' })
  expect(k.signals.theme()).toBe('light')
})
```

Grep delete createThemeState usages.

- [ ] **Step 6: Build + test**

```bash
pnpm --filter @363045841yyt/klinechart-core build
pnpm --filter @363045841yyt/klinechart-core exec vitest run
pnpm --filter @363045841yyt/klinechart exec vitest run
```

- [ ] **Step 7: Commit**

```bash
git commit -am "refactor(core): merge theme preference into settings with effectiveTheme"
```

---

## Task 5: C4 docs + PRD status

**Files:**
- Spec already documents C4 in design §7
- Modify: `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` add Phase C checkboxes
- Optional: short note in AGENTS Known Quirks if theme default changes

- [ ] **Step 1: PRD block**

```markdown
## Phase C — SSOT cleanup (2026-07-15)
- [x] C1 drawing selection/getAll/removeDrawing
- [x] C2 Vue tool / range-select split
- [x] C3 theme preference in settings + effectiveTheme
- [x] C4 scale three-layer semantics documented
```

- [ ] **Step 2: Commit**

```bash
git add docs .opencode/plans
git commit -m "docs: mark SSOT cleanup Phase C complete"
```

---

## Self-Review

| Spec | Tasks |
|------|-------|
| C1 selection + getAll + removeDrawing | Task 1–2 |
| C2 Vue tool split | Task 3 |
| C3 theme merge | Task 4 |
| C4 scale docs | Task 5 + design §7 |
| Non-goals (no full DrawingState array drop) | Respected |

**Type consistency:** `DrawingToolId`, settings.theme `'light'|'dark'|'auto'`, effective `'light'|'dark'`.

**Default theme:** Follow DEFAULT_SETTINGS (`dark`); document if tests assumed old themeState `light`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-ssot-cleanup-C.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task  
2. **Inline Execution** — this session with checkpoints  

Which approach?
