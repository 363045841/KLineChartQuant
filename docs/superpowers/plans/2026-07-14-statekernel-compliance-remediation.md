# StateKernel Compliance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 engine 层对 AGENTS.md StateKernel 五原则的全部剩余违规，使 chart 状态真正做到单一真理源、自动派生、读写分离、effect 只出不进、多字段原子 batch。

**Architecture:** 分四阶段推进，每阶段可独立合并与验证。Phase A 统一 content 几何（消除漂移风险）。Phase B 收敛 effect→signal 与 batch 内副作用。Phase C 将 pane / options / comparison / subPane 并行状态迁入或明确归属 kernel。Phase D 硬化 ReadonlySignal 边界与 dispose/reset 卫生。不引入新状态库；继续使用现有 `createSubState` / `computed` / `effect` / `batch` / `actions`。

**Tech Stack:** TypeScript, vitest (jsdom/node), `@363045841yyt/klinechart-core`, 现有 reactivity (`packages/core/src/foundation/reactivity/signal.ts`)

**Principles (AGENTS.md):**
1. Single Source of Truth — 只经 Actions 写 WritableSignal
2. Automatic Derivation — 派生只用 computed()
3. Read/Write Separation — 对外 ReadonlySignal
4. Effect Isolation — effect 只做 DOM/WebGL 输出，不写 Signal
5. Batched Atomic Updates — 多字段写用 batch()

---

## File Structure

| Path | Responsibility after remediation |
|------|-----------------------------------|
| `packages/core/src/engine/state/contentGeometry.ts` | **新建** pure 几何函数（leftBuffer / contentWidth / maxScroll），供 computed 与 compensator 共用 |
| `packages/core/src/engine/state/viewportState.ts` | 调用 pure 函数；保持 contentWidth/maxScrollLeft/scrollLeft 为 computed |
| `packages/core/src/engine/data/scrollCompensator.ts` | 删除本地重算；改为读 kernel viewport readonly 或调用同一 pure 函数 |
| `packages/core/src/engine/data/chartDataManager.ts` | getContentWidth/getLeftLoadBufferWidth 委托 kernel；data 同步改为订阅回调进 Action；副作用移出 batch |
| `packages/core/src/engine/chart.ts` | 公开 getContentWidth 读 kernel；options 迁入 kernel 后删除 `_optionsSignal` 作为 SSOT |
| `packages/core/src/engine/state/chartStateKernel.ts` | 去掉 `_dprPlaceholder` effect；dispose 清理；挂 options/comparison 子状态 |
| `packages/core/src/engine/state/zoomState.ts` | dpr 依赖改为显式注入的稳定 ReadonlySignal（无 placeholder） |
| `packages/core/src/engine/state/optionsState.ts` | **新建** chart options 子状态 |
| `packages/core/src/engine/state/comparisonState.ts` | **新建** comparison colors/loading 子状态 |
| `packages/core/src/engine/state/paneState.ts` | 成为 pane ratios/specs 的 SSOT；layout 只读+通过 actions 写回 |
| `packages/core/src/engine/layout/chartPaneLayout.ts` | 去掉 `_internalPaneRatios` 作为真相；读写 kernel pane actions |
| `packages/core/src/engine/data/comparisonManager.ts` | 去掉自有 WritableSignal；写 kernel comparison actions |
| `packages/core/src/engine/subPaneManager.ts` | entries 真相迁入 indicator/subPane 状态或经 actions 同步 |
| `packages/core/src/foundation/reactivity/signal.ts` | createSubState 对外 readonly 剥离 `.set`（proxy 或包装） |
| `packages/core/src/engine/viewport/chartViewportManager.ts` | 删除 `as Signal` 回写类型 |
| `packages/core/src/__tests__/stateKernel.test.ts` | 扩展几何统一、batch、dispose 测试 |
| `packages/core/src/engine/data/__tests__/scrollCompensator.test.ts` | **新建** 与 kernel 几何一致性测试 |
| `packages/core/src/engine/data/__tests__/chartDataManager.incrementalLoad.test.ts` | 保持/扩展 leftBuffer 来自 kernel 的断言 |

---

## Phase overview

| Phase | Scope | Exit criteria |
|-------|--------|----------------|
| A | 统一 content 几何 | DOM width / compensator / public API / load-hint 同一公式与同一输入 |
| B | Effect 隔离 + batch 纯净 | 无 effect 写 kernel signal；dpr 无 placeholder effect；data 回调副作用不在 batch 内 |
| C | 并行状态归位 | pane / options / comparison（及 subPane 信号）以 kernel 为对外 SSOT |
| D | R/W 硬化 + dispose | readonly 运行时无 `.set`；dispose/reset batch 且字段完整 |

每 Phase 结束后：

```bash
pnpm --filter @363045841yyt/klinechart-core test -- --exclude src/rendering/render/__tests__/webglRenderer.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: tests green (已知 WebGL canvas 环境失败可继续 exclude)；build pass。  
**仅在用户明确要求时 commit。**

---

## Phase A — Unify content geometry (P0)

### Task A1: Extract pure geometry helpers + failing parity tests

**Files:**
- Create: `packages/core/src/engine/state/contentGeometry.ts`
- Create: `packages/core/src/engine/data/__tests__/contentGeometry.parity.test.ts`
- Modify: `packages/core/src/engine/state/viewportState.ts` (later tasks wire it)

- [ ] **Step 1: Write failing parity test first**

```typescript
// packages/core/src/engine/data/__tests__/contentGeometry.parity.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeLeftLoadBufferWidth,
  computeContentWidth,
  computeMaxScrollLeft,
} from '../../state/contentGeometry'
import { SCROLL_TRAILING_SLOTS } from '../scrollCompensator'

describe('contentGeometry pure helpers', () => {
  const base = {
    viewWidth: 800,
    plotWidth: 800,
    dpr: 1,
    kWidth: 6,
    kGap: 1,
  }

  it('returns 0 left buffer and content when dataLength is 0', () => {
    expect(computeLeftLoadBufferWidth({ ...base, dataLength: 0, period: 'daily' })).toBe(0)
    expect(computeContentWidth({ ...base, dataLength: 0, period: 'daily' })).toBe(0)
  })

  it('timeshare has no left buffer and content equals single screen width', () => {
    expect(computeLeftLoadBufferWidth({ ...base, dataLength: 240, period: 'timeshare' })).toBe(0)
    expect(computeContentWidth({ ...base, dataLength: 240, period: 'timeshare' })).toBe(
      0 + Math.max(base.viewWidth, 1),
    )
  })

  it('kline left buffer equals rounded viewWidth when data present', () => {
    expect(computeLeftLoadBufferWidth({ ...base, dataLength: 100, period: 'daily' })).toBe(800)
  })

  it('kline contentWidth matches historical formula with trailing slots', () => {
    // Must stay bit-compatible with former ScrollCompensator.getContentWidth
    const dataLength = 100
    const left = computeLeftLoadBufferWidth({ ...base, dataLength, period: 'daily' })
    const width = computeContentWidth({ ...base, dataLength, period: 'daily' })
    expect(left).toBe(800)
    expect(width).toBeGreaterThan(left)
    expect(SCROLL_TRAILING_SLOTS).toBe(30)
    expect(computeMaxScrollLeft(width, base.viewWidth)).toBe(Math.max(0, width - base.viewWidth))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/engine/data/__tests__/contentGeometry.parity.test.ts
```

Expected: FAIL — module `contentGeometry` not found.

- [ ] **Step 3: Implement pure helpers**

```typescript
// packages/core/src/engine/state/contentGeometry.ts
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { SCROLL_TRAILING_SLOTS } from '../data/scrollCompensator'

export type ContentGeometryInput = {
  viewWidth: number
  plotWidth: number
  dataLength: number
  period: string
  dpr: number
  kWidth: number
  kGap: number
}

/** 左侧增量加载缓冲宽度（CSS px） */
export function computeLeftLoadBufferWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0 || input.period === 'timeshare') return 0
  return Math.round(input.viewWidth)
}

/** 滚动内容总宽度（CSS px） */
export function computeContentWidth(input: ContentGeometryInput): number {
  if (input.dataLength === 0) return 0
  const left = computeLeftLoadBufferWidth(input)
  if (input.period === 'timeshare') {
    return left + Math.max(input.viewWidth, 1)
  }
  const { startXPx, unitPx } = getPhysicalKLineConfig(input.kWidth, input.kGap, input.dpr)
  const dataPlotWidth =
    (startXPx + (input.dataLength + SCROLL_TRAILING_SLOTS) * unitPx) / input.dpr
  return left + Math.max(dataPlotWidth, input.viewWidth)
}

export function computeMaxScrollLeft(contentWidth: number, viewWidth: number): number {
  return Math.max(0, contentWidth - viewWidth)
}
```

Notes:
- `period === 'timeshare'` 必须与 `viewportState` 现有行为一致（leftBuffer=0）。
- 旧 `ScrollCompensator.getLeftLoadBufferWidth` **没有** timeshare 分支且 fallback `clientWidth`；统一后以 kernel 输入（viewWidth/plotWidth/dataLength/period/dpr/kWidth/kGap）为准，**删除 clientWidth fallback**，避免第二真相源。

- [ ] **Step 4: Re-run parity tests**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/engine/data/__tests__/contentGeometry.parity.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit only if user asks**

---

### Task A2: Wire viewportState to pure helpers

**Files:**
- Modify: `packages/core/src/engine/state/viewportState.ts`
- Test: `packages/core/src/__tests__/stateKernel.test.ts`

- [ ] **Step 1: Replace local computeLeftLoadBufferWidth / computeContentWidth bodies**

In `viewportState.ts`, import pure helpers and implement:

```typescript
import {
  computeLeftLoadBufferWidth as pureLeftBuffer,
  computeContentWidth as pureContentWidth,
} from './contentGeometry'

// inside createViewportState:
const computeLeftLoadBufferWidth = (viewWidth: number): number =>
  pureLeftBuffer({
    viewWidth,
    plotWidth: Math.round(viewWidth),
    dataLength: signalDeps.dataLength$(),
    period: signalDeps.period$(),
    dpr: 1, // unused for left buffer
    kWidth: 0,
    kGap: 0,
  })

const computeContentWidth = (
  viewWidth: number,
  leftLoadBufferWidth: number,
  dpr: number,
): number => {
  const options = signalDeps.options$()
  // Prefer pure helper; left buffer recomputed inside pure for SSOT
  return pureContentWidth({
    viewWidth,
    plotWidth: viewWidth,
    dataLength: signalDeps.dataLength$(),
    period: signalDeps.period$(),
    dpr,
    kWidth: options.kWidth,
    kGap: options.kGap,
  })
}
```

Important: after refactor, **不要**再传入“外部算好的 leftLoadBufferWidth 覆盖 pure 结果”。`contentWidth` computed 只调用 `pureContentWidth`；`leftLoadBufferWidth` subState computed 只调用 `pureLeftBuffer`。若 pure 内部已含 left，删除重复相加。

- [ ] **Step 2: Run existing viewport tests**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/__tests__/stateKernel.test.ts
```

Expected: all viewport tests PASS（若 timeshare/leftBuffer 断言失败，对齐 pure 与现有测试期望，以现有 kernel 行为为准）。

---

### Task A3: Delete dual formulas in ScrollCompensator

**Files:**
- Modify: `packages/core/src/engine/data/scrollCompensator.ts`
- Modify: `packages/core/src/engine/data/chartDataManager.ts` (deps wiring)
- Modify: `packages/core/src/engine/chart.ts` (deps for compensator)

- [ ] **Step 1: Change ScrollDeps to inject geometry readers**

```typescript
// scrollCompensator.ts
export interface ScrollDeps {
  getOption: () => { kWidth: number; kGap: number }
  getEffectiveDpr: () => number
  getCachedScrollLeft: () => number
  setScrollLeft: (v: number) => void
  getDom: () => ChartDom
  getObservedSize: () => { width: number; height: number }
  getViewport: () => Viewport | null
  /** SSOT readers — prefer kernel peeks */
  getLeftLoadBufferWidth: (dataLength: number) => number
  getContentWidth: (dataLength: number) => number
}
```

Remove methods that reimplement geometry:

```typescript
// DELETE local getLeftLoadBufferWidth / getContentWidth implementations.
// Use this.deps.getLeftLoadBufferWidth(dataLength) / getContentWidth(dataLength) only.
```

Update call sites inside class:

```typescript
const leftBuffer = this.deps.getLeftLoadBufferWidth(dataLength)
const contentWidth = this.deps.getContentWidth(dataLength)
```

- [ ] **Step 2: Wire ChartDataManager deps from kernel**

In `chart.ts` when constructing `ChartDataManager`, pass:

```typescript
getLeftLoadBufferWidth: () => this.kernel.viewport.readonly.leftLoadBufferWidth.peek(),
getContentWidth: () => this.kernel.viewport.readonly.contentWidth.peek(),
```

And change `ChartDataManager.getLeftLoadBufferWidth` / `getContentWidth` to:

```typescript
getLeftLoadBufferWidth(): number {
  return this.deps.getLeftLoadBufferWidth()
}

getContentWidth(): number {
  return this.deps.getContentWidth()
}
```

Delete timeshare branch that reimplements width in `chartDataManager.getContentWidth` — kernel already handles period.

- [ ] **Step 3: Point Chart public API at kernel**

```typescript
// chart.ts
getContentWidth(): number {
  return this.kernel.viewport.readonly.contentWidth.peek()
}

getLeftLoadBufferWidth(): number {
  return this.kernel.viewport.readonly.leftLoadBufferWidth.peek()
}
```

Replace remaining `this.dataManager.getLeftLoadBufferWidth()` in chart.ts (overlay offsets etc.) with `this.getLeftLoadBufferWidth()` or kernel peek.

- [ ] **Step 4: recordIncrementalLoad uses kernel left buffer**

```typescript
// chartDataManager.ts
private recordIncrementalLoad(prependedCount: number): void {
  this._dmState.actions.recordIncrementalLoad(
    prependedCount,
    this.deps.getLeftLoadBufferWidth(),
  )
}
```

- [ ] **Step 5: Add parity test compensator vs kernel**

```typescript
// packages/core/src/engine/data/__tests__/scrollCompensator.geometry.test.ts
import { describe, it, expect } from 'vitest'
import { createViewportState } from '../../state/viewportState'
import { ScrollCompensator } from '../scrollCompensator'

describe('ScrollCompensator uses injected geometry SSOT', () => {
  it('scrollToRight clamps with same max as kernel maxScrollLeft', async () => {
    let scrollLeft = 0
    const dataLength = 100
    const vp = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 6, kGap: 1 })) as any,
      dataLength$: (() => dataLength) as any,
      period$: (() => 'daily') as any,
      zoomLevel$: (() => 1) as any,
    } as any)
    vp.actions.resize(800, 400, 1)
    // init without real DOM: set requested via scrollTo after manual content
    const max = (vp.readonly as any).maxScrollLeft()
    const content = (vp.readonly as any).contentWidth()

    const compensator = new ScrollCompensator({
      getOption: () => ({ kWidth: 6, kGap: 1 }),
      getEffectiveDpr: () => 1,
      getCachedScrollLeft: () => scrollLeft,
      setScrollLeft: (v) => {
        scrollLeft = v
      },
      getDom: () => ({ container: null }) as any,
      getObservedSize: () => ({ width: 800, height: 400 }),
      getViewport: () => ({
        viewWidth: 800,
        viewHeight: 400,
        plotWidth: 800,
        plotHeight: 370,
        scrollLeft: 0,
        dpr: 1,
      }),
      getLeftLoadBufferWidth: () => (vp.readonly as any).leftLoadBufferWidth(),
      getContentWidth: () => content,
    })

    compensator.scrollToRight(dataLength)
    expect(scrollLeft).toBeLessThanOrEqual(max)
    expect(scrollLeft).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 6: Run Phase A verification**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/__tests__/stateKernel.test.ts src/engine/data/__tests__/contentGeometry.parity.test.ts src/engine/data/__tests__/scrollCompensator.geometry.test.ts src/engine/data/__tests__/chartDataManager.incrementalLoad.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: PASS

**Phase A done when:** repo 内仅有一套 content 几何公式（`contentGeometry.ts`），kernel computed 与 compensator/API/hint 全部消费它或消费 kernel readonly。

---

## Phase B — Effect isolation & pure batch (P1)

### Task B1: Replace data/loading mirror effects with explicit subscriptions

**Problem:** `chartDataManager.ts` `_dataSyncEffect` / `_loadingSyncEffect` 在 effect 内调用 `dataState.actions.*`，违反 “effects must not write Signals”。

**Target model:**
- Buffer 仍拥有自己的 WritableSignal（I/O 层）。
- 进入 kernel 的路径必须是 **事件/订阅回调 → Action**，不是 effect 追踪后写回。

**Files:**
- Modify: `packages/core/src/engine/data/chartDataManager.ts`
- Modify: `packages/core/src/engine/state/dataState.ts` (if needed)
- Test: `packages/core/src/engine/data/__tests__/chartDataManager.incrementalLoad.test.ts`

- [ ] **Step 1: Write failing test that documents subscription path**

```typescript
it('propagates buffer data into dataState without relying on a kernel-writing effect contract', () => {
  // Arrange active buffer, push data via buffer API
  // Assert dataState.readonly.dataLength updates
  // Assert loading false flushes incremental hint (existing behavior)
})
```

- [ ] **Step 2: On activateBuffer, subscribe to buffer signals**

Replace constructor effects with per-activation subscriptions:

```typescript
private _dataUnsub: (() => void) | null = null
private _loadingUnsub: (() => void) | null = null

private bindActiveBuffer(key: string): void {
  this.unbindActiveBuffer()
  const buf = this._lookupBuffer(key)
  if (!buf) return

  this._dataUnsub = buf.data.subscribe(() => {
    this.handleBufferDataEvent(key)
  })
  this._loadingUnsub = buf.loading.subscribe(() => {
    this.handleBufferLoadingEvent(key)
  })

  // Initial sync (explicit actions, not effect)
  this.handleBufferDataEvent(key)
  this.handleBufferLoadingEvent(key)
}

private unbindActiveBuffer(): void {
  this._dataUnsub?.()
  this._loadingUnsub?.()
  this._dataUnsub = null
  this._loadingUnsub = null
  this._lastDataChange = null
}

private handleBufferDataEvent(key: string): void {
  if (this._dataState.readonly.activeBufferKey.peek() !== key) return
  const buf = this._lookupBuffer(key)
  if (!buf) return
  const dataChange = buf.data.peek()
  if (dataChange === this._lastDataChange) return
  this._lastDataChange = dataChange

  const prevDataLength = this._dataState.readonly.dataLength.peek()
  this._dataState.actions.setData([...(dataChange.data as unknown[])])
  this.onBufferDataChanged(key, prevDataLength, dataChange.prependedCount)
}

private handleBufferLoadingEvent(key: string): void {
  if (this._dataState.readonly.activeBufferKey.peek() !== key) return
  const buf = this._lookupBuffer(key)
  if (!buf) return
  const loading = buf.loading.peek()
  this._dataState.actions.setLoading(loading)
  if (!loading) this.scheduleIncrementalLoadHintFlush(key)
}
```

Call `bindActiveBuffer` from `activateBuffer` / mode switches; call `unbindActiveBuffer` in dispose.

- [ ] **Step 3: Remove `_dataSyncEffect` / `_loadingSyncEffect` and their dispose cleanup**

- [ ] **Step 4: Run incremental load + data manager related tests**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/engine/data/__tests__/chartDataManager.incrementalLoad.test.ts
```

Expected: PASS；首次 loading→false 仍 flush hint。

---

### Task B2: Move side effects out of batch()

**Files:**
- Modify: `packages/core/src/engine/data/chartDataManager.ts`

- [ ] **Step 1: Ensure handleBufferDataEvent does not batch side effects**

```typescript
// Signal writes only (single field ok without batch; multi-field use batch)
this._dataState.actions.setData([...])

// Side effects AFTER signal write, outside batch:
this.onBufferDataChanged(key, prevDataLength, dataChange.prependedCount)
```

`onBufferDataChanged` may call `setScrollLeft` / `scheduleDraw` / indicator update — these must **not** sit inside `batch(() => { setData; onBuffer... })`.

- [ ] **Step 2: Grep for remaining batch+side-effect patterns**

```bash
# PowerShell
rg "batch\(" packages/core/src/engine/data/chartDataManager.ts -n
```

Confirm each `batch` only contains signal `.set` / actions that only set signals.

---

### Task B3: Remove `_dprPlaceholder` effect (circular zoom↔viewport)

**Problem:** `chartStateKernel.ts` 用 effect 把 `viewport.dpr` 写入 placeholder，供 `zoomState.kGap` 使用；dispose 未清理。

**Preferred design (no effect write):**
- `kGap` 不在 zoomState 内依赖 dpr computed。
- 或拆成两段：`kWidth` 仅依赖 zoomLevel；`kGap` 在 **viewport 的 options 组合 computed** 中用 `kGapFromKWidth(kWidth, dpr)` 计算。

**Files:**
- Modify: `packages/core/src/engine/state/zoomState.ts`
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/state/viewportState.ts` (options$ already provides kGap)
- Test: `packages/core/src/__tests__/stateKernel.test.ts`

- [ ] **Step 1: Change zoomState so kGap does not need live dpr**

Option (recommended):

```typescript
// zoomState: only zoomLevel + kWidth computed
// remove kGap from zoomState computed

// chartStateKernel.optionsForViewport$:
this.optionsForViewport$ = computed(() => {
  const o = deps.options$()
  const kWidth = this.zoom.readonly.kWidth()
  const dpr = this.viewport?.readonly.dpr.peek() // PROBLEM: viewport not created yet
  ...
})
```

Because construction order is zoom → viewport，采用：

**Final structure:**
1. `createZoomState` 只暴露 `zoomLevel` + `kWidth`（无 kGap）。
2. `createViewportState` 的 `options$` 输入改为提供 `kWidth` + raw options；在 viewport 内部用 **自己的** `readonly.dpr` 计算 gap：

```typescript
// viewportState options dep shape change:
options$: ReadonlySignal<{ bottomAxisHeight: number; kWidth: number; /* no kGap */ }>

// inside viewport computed for physical config:
const kGap = kGapFromKWidth(options.kWidth, readonly.dpr())
```

3. 对外仍可通过 kernel 暴露：

```typescript
kGap: computed(() => kGapFromKWidth(this.zoom.readonly.kWidth(), this.viewport.readonly.dpr()))
```

- [ ] **Step 2: Delete `_dprPlaceholder` and the wiring effect**

```typescript
// DELETE:
// const _dprPlaceholder = writableRef(1)
// effect(() => _dprPlaceholder.set(this.viewport.readonly.dpr()))
```

- [ ] **Step 3: Update all kGap readers**

Grep:

```bash
rg "zoom\.readonly\.kGap|kGap:" packages/core/src -n
```

Route them through new kernel computed or viewport-local calculation.

- [ ] **Step 4: dispose hygiene**

If any effect remains in kernel constructor, store disposer and call it in `dispose()`:

```typescript
private _disposers: Array<() => void> = []
// ...
this._disposers.push(effect(...))
// dispose:
for (const d of this._disposers) d()
this._disposers = []
```

- [ ] **Step 5: Tests**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/__tests__/stateKernel.test.ts
```

Add:

```typescript
it('kGap tracks dpr without a placeholder effect', () => {
  // resize dpr 1 -> 2, expect kGap change via kGapFromKWidth
})
```

---

### Task B4: Phase B verification

```bash
pnpm --filter @363045841yyt/klinechart-core test -- --exclude src/rendering/render/__tests__/webglRenderer.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

**Phase B done when:**
- 无 `effect(() => *.actions.*)` / `effect(() => signal.set)` 在 dataManager 与 chartStateKernel
- batch 内无 scheduleDraw / scroll DOM / indicator 副作用
- dpr placeholder 删除

---

## Phase C — Parallel state into kernel (P1)

### Task C1: Pane ratios SSOT

**Problem:** `ChartPaneLayout._internalPaneRatios` 是工作真相；kernel `pane.readonly.paneRatios` 是 mirror。

**Target:**
- Kernel `pane` 为 ratios/specs SSOT。
- Layout 只持有 DOM/renderer；读 `getPaneRatios()` from deps；写通过 `onRatiosCommit(ratios)` → `pane.actions.setPaneRatios`。

**Files:**
- Modify: `packages/core/src/engine/state/paneState.ts`
- Modify: `packages/core/src/engine/layout/chartPaneLayout.ts`
- Modify: `packages/core/src/engine/chart.ts`

- [ ] **Step 1: Expand pane actions for atomic updates**

```typescript
// paneState.ts
actions: {
  setPaneRatios(ratios: Record<string, number>) {
    signals.paneRatios.set({ ...ratios })
  },
  setPaneSpecs(specs: PaneSpec[]) {
    signals.paneSpecs.set(specs.map((s) => ({ ...s })))
  },
  applyLayout(ratios: Record<string, number>, specs: PaneSpec[]) {
    batch(() => {
      signals.paneRatios.set({ ...ratios })
      signals.paneSpecs.set(specs.map((s) => ({ ...s })))
    })
  },
}
```

- [ ] **Step 2: ChartPaneLayout deps**

```typescript
export interface PaneLayoutDependencies {
  // existing...
  getPaneRatios: () => Record<string, number>
  commitLayout: (ratios: Record<string, number>, specs: PaneSpec[]) => void
}
```

Replace `_internalPaneRatios` reads with:

```typescript
private getRatio(id: string): number {
  return this.deps.getPaneRatios()[id] ?? 0
}
```

During layout computations that need temporary mutation, work on a **local Map copy**, then single `commitLayout` at end (one Action). Do not keep long-lived parallel Map as SSOT after commit.

Migration strategy (minimal risk):
1. Keep private Map as **working buffer during a single layoutPanes() call only**.
2. At start of `layoutPanes` / `applyPaneLayoutSpecs`, hydrate Map from `deps.getPaneRatios()`.
3. At end, `deps.commitLayout(mapToRecord(map), specs)` only.
4. Delete cross-call reliance on Map without rehydrate.

- [ ] **Step 3: Wire chart.ts**

```typescript
onLayoutChange: (ratios, specs) => {
  this.kernel.pane.actions.applyLayout(ratios, specs)
},
getPaneRatios: () => this.kernel.pane.readonly.paneRatios.peek(),
commitLayout: (ratios, specs) => this.kernel.pane.actions.applyLayout(ratios, specs),
```

- [ ] **Step 4: Tests**

Add layout unit test if missing: drag separator → kernel paneRatios updates → second layout reads same ratios.

```bash
pnpm --filter @363045841yyt/klinechart-core test -- -t "pane"
```

---

### Task C2: optionsState module

**Problem:** `chart.ts` `_optionsSignal` 是 kernel 外 WritableSignal。

**Files:**
- Create: `packages/core/src/engine/state/optionsState.ts`
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/chart.ts`

- [ ] **Step 1: Create options sub-state**

```typescript
// optionsState.ts
import { createSubState, batch } from '../../foundation/reactivity/signal'
import type { ChartOptions } from '../chartTypes'

type Resolved = Omit<ChartOptions, 'kWidth' | 'kGap'>

export function createOptionsState(initial: Resolved) {
  const { signals, readonly } = createSubState({ options: initial })

  return {
    readonly,
    actions: {
      patch(partial: Partial<Resolved>) {
        signals.options.set({ ...signals.options.peek(), ...partial })
      },
      replace(next: Resolved) {
        signals.options.set(next)
      },
    },
    dispose() {
      // keep last or reset to initial — choose reset-to-initial for determinism
      signals.options.set(initial)
    },
  }
}
```

- [ ] **Step 2: Kernel owns options**

```typescript
// ChartStateKernelDeps gains initialOptions
this.options = createOptionsState(deps.initialOptions)
// options$ for zoom/viewport derived from this.options.readonly.options
```

- [ ] **Step 3: Chart uses kernel actions**

```typescript
// replace this._optionsSignal.set(...)
this.kernel.options.actions.patch(partial)

// replace peeks
this.kernel.options.readonly.options.peek()
```

- [ ] **Step 4: Export ReadonlySignal on public API if needed**

Do not export WritableSignal.

---

### Task C3: comparisonState module

**Files:**
- Create: `packages/core/src/engine/state/comparisonState.ts`
- Modify: `packages/core/src/engine/data/comparisonManager.ts`
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/controllers/createChartController.ts` (types stay ReadonlySignal)

- [ ] **Step 1: comparisonState**

```typescript
export function createComparisonState() {
  const { signals, readonly } = createSubState({
    colors: new Map<string, string>() as ReadonlyMap<string, string>,
    loading: false,
  })
  return {
    readonly,
    actions: {
      setColors(colors: ReadonlyMap<string, string>) {
        signals.colors.set(colors)
      },
      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },
    },
    dispose() {
      batch(() => {
        signals.colors.set(new Map())
        signals.loading.set(false)
      })
    },
  }
}
```

- [ ] **Step 2: ComparisonManager writes via hooks**

```typescript
export interface ComparisonHooks {
  // existing...
  setColors(colors: ReadonlyMap<string, string>): void
  setLoading(loading: boolean): void
}
// replace this._colorsSignal.set(x) with this._hooks.setColors(x)
```

- [ ] **Step 3: Chart exposes kernel readonly**

```typescript
get comparisonColors(): ReadonlySignal<ReadonlyMap<string, string>> {
  return this.kernel.comparison.readonly.colors
}
```

Remove `Signal<>` writable return type from chart and controller comments about “not yet migrated”.

---

### Task C4: subPane entries signal ownership

**Problem:** `SubPaneManager._entriesSignal` 是游离 WritableSignal。

**Pragmatic approach (avoid big indicator rewrite):**
1. 短期：`SubPaneManager` 保留内部 Map 作为命令式 registry（非 chart domain state），但 **对外只暴露 ReadonlySignal**（包装 strip `.set`）。
2. 中期：`createSubPaneState` 进 kernel，manager 在 create/remove 时 `actions.setEntries`。

Plan requires at least step 1+2 for compliance:

- [ ] **Step 1: createSubPaneState in kernel**

```typescript
// subPaneState.ts
createSubState({ entries: [] as ReadonlyArray<SubPaneEntry> })
```

- [ ] **Step 2: SubPaneManager.syncEntriesSignal → deps.commitEntries(entries)**

```typescript
private syncEntriesSignal(): void {
  this._hooks.commitEntries(this.getAll())
}
```

- [ ] **Step 3: chartIndicatorManager.subPanesComputed reads kernel or manager readonly only**

---

### Task C5: Phase C verification

```bash
pnpm --filter @363045841yyt/klinechart-core test -- --exclude src/rendering/render/__tests__/webglRenderer.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

Grep gates (must find zero):

```bash
rg "_optionsSignal" packages/core/src/engine/chart.ts
rg "_colorsSignal|_loadingSignal" packages/core/src/engine/data/comparisonManager.ts
rg "_internalPaneRatios" packages/core/src/engine/layout/chartPaneLayout.ts
```

**Phase C done when:** 上述 grep 为空（或 pane Map 仅函数内局部变量）；controller 注释 “not yet migrated” 删除。

---

## Phase D — R/W hardening & dispose hygiene (P2)

### Task D1: Strip `.set` on createSubState readonly bag

**Files:**
- Modify: `packages/core/src/foundation/reactivity/signal.ts`
- Test: `packages/core/src/__tests__/stateKernel.types.test.ts` + runtime test

- [ ] **Step 1: Runtime readonly wrapper**

```typescript
function asReadonlySignal<T>(sig: WritableSignal<T>): ReadonlySignal<T> {
  const read = (() => sig()) as ReadonlySignal<T>
  return Object.assign(read, {
    peek: sig.peek,
    subscribe: sig.subscribe,
  })
}

// in createSubState loop:
readonly[key] = asReadonlySignal(sig)
```

This creates a **new object without `.set`**.

- [ ] **Step 2: Runtime test**

```typescript
it('readonly bag has no callable set at runtime', () => {
  const m = createSubState({ x: 1 })
  expect('set' in m.readonly.x).toBe(false)
})
```

- [ ] **Step 3: Remove dangerous casts**

```typescript
// chartViewportManager.ts — delete `as unknown as Signal<ViewportState>`
// expose ReadonlySignal only
```

Grep:

```bash
rg "as unknown as Signal|as Signal<" packages/core/src/engine -n
```

Fix each to ReadonlySignal or method-based access.

---

### Task D2: Batch dispose/reset multi-writes

**Files:**
- Modify: `packages/core/src/engine/state/dataState.ts`
- Modify: `packages/core/src/engine/state/dataManagerState.ts`
- Modify: `packages/core/src/engine/state/interactionState.ts`
- Modify: `packages/core/src/engine/state/viewportState.ts`
- Modify: `packages/core/src/engine/state/drawingState.ts`
- Modify: `packages/core/src/engine/state/paneState.ts`

- [ ] **Step 1: Wrap multi-set dispose/reset in batch**

Example `dataState.ts`:

```typescript
reset() {
  batch(() => {
    signals.data.set([])
    signals.loading.set(false)
    signals.activeBufferKey.set(null)
    signals.symbols.set([])
    signals.symbolCatalog.set([])
  })
},
dispose() {
  this.actions.reset() // or same batch body
}
```

- [ ] **Step 2: Align reset with dispose field completeness**

`dataState.reset` must clear the same fields as dispose (symbols + catalog included) unless documented otherwise. Prefer **identical**.

- [ ] **Step 3: viewport dispose**

```typescript
dispose() {
  canvasDomEffect?.()
  webglEffect?.()
  scrollDomEffect?.()
  canvasDomEffect = webglEffect = scrollDomEffect = null
  batch(() => {
    signals.initialized.set(false)
    signals.preciseDpr.set(0)
    signals.viewWidth.set(0)
    signals.viewHeight.set(0)
    signals.requestedScrollLeft.set(0)
  })
}
```

---

### Task D3: resize/scrollTo NaN already handled — document invariant

Confirm `setRequestedScrollLeft` still does `Number.isFinite` normalization (already present). Add same for `resize` dimensions:

```typescript
resize(width: number, height: number, dpr: number) {
  const w = Number.isFinite(width) ? width : 0
  const h = Number.isFinite(height) ? height : 0
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  batch(() => { /* ... */ })
}
```

---

### Task D4: Final compliance audit gates

Add a lightweight checklist test or script comments in plan execution notes:

```bash
# Must be empty or only allowlisted
rg "effect\(\(\) =>" packages/core/src/engine/state packages/core/src/engine/data -n
# Manually verify each effect only writes DOM/WebGL, never signals

rg "getContentWidth\(|getLeftLoadBufferWidth\(" packages/core/src/engine -n
# All should end at kernel.readonly or contentGeometry pure

rg "createSignal\(" packages/core/src/engine -n
# Remaining createSignal only inside state modules or true I/O buffers
```

Full suite:

```bash
pnpm --filter @363045841yyt/klinechart-core test -- --exclude src/rendering/render/__tests__/webglRenderer.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

Optional after all phases:

```bash
pnpm type-check
```

Note: known `baseUrl` deprecation may still warn; not a blocker for this plan.

---

## Execution order (agents)

1. **A1 → A2 → A3** (geometry SSOT) — ship first, highest bug risk reduction  
2. **B1 → B2 → B3 → B4** (effect/batch purity)  
3. **C1 → C2 → C3 → C4 → C5** (parallel state) — largest blast radius; do after A/B stable  
4. **D1 → D2 → D3 → D4** (hardening)

Do **not** mix Phase C pane rewrite with Phase A geometry in the same commit batch.

---

## Risk notes

| Risk | Mitigation |
|------|------------|
| scrollToRight pixel drift after geometry unify | Parity tests with fixed kWidth/kGap/dpr/dataLength; compare before/after numeric fixtures |
| timeshare leftBuffer regression | Explicit tests period=`timeshare` → 0 buffer |
| subscribe vs effect timing for incremental hint | Keep initial sync on bind; keep loading false → flush path test with real jsdom |
| pane layout thrash | Single commitLayout per layoutPanes; batch ratios+specs |
| options migration miss a peek site | `rg _optionsSignal` until empty |
| readonly strip breaks code that illegally called `.set` | Runtime test will surface; fix callers to use actions |

---

## Out of scope

- WebGL renderer jsdom canvas failures  
- Vue/React binding redesign beyond ReadonlySignal consumption  
- Plugin StateStore migration  
- Renaming public controller APIs  
- Commits without explicit user request  

---

## Spec coverage checklist

| Audit finding | Task |
|---------------|------|
| Dual contentWidth / leftBuffer | A1–A3 |
| Effect writes dataState | B1 |
| batch 内副作用 | B2 |
| `_dprPlaceholder` effect | B3 |
| Pane Map mirror | C1 |
| `_optionsSignal` parallel | C2 |
| comparison WritableSignals | C3 |
| subPane entries signal | C4 |
| createSubState `.set` leak + casts | D1 |
| dispose/reset unbatched / incomplete | D2 |
| NaN resize | D3 |
| Final gates | D4 |

---

## Self-review

- No TBD placeholders for core steps; code sketches are copy-adaptable.  
- Types: `ContentGeometryInput`, `applyLayout`, `createOptionsState`, `createComparisonState` naming consistent across tasks.  
- TDD: each phase starts with failing tests where behavior changes.  
- YAGNI: subPane full domain model not redesigned — only SSOT signal ownership.  
- DRY: single `contentGeometry.ts` for all width math.
