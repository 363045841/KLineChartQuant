# DrawingStore & PaneLayout Kernel Ownership (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消灭绘图与 pane 布局上的业务双写：`DrawingStore` 只投影 `kernel.drawing`；`selectedDrawingId` 进 kernel；`ChartPaneLayout` 明确「算法工作副本 → commit 回 kernel」契约并堵住公共读路径读到未提交副本。

**Architecture:** 沿用 P1 marker 模式。业务 SSOT 只在 StateKernel；渲染 Manager/Store 读 `ReadonlySignal`；Chart 公开 API 是唯一「写 kernel + 清 runtime 副作用 + scheduleDraw」入口。`ChartPaneLayout` 保留 resize/normalize 的本地工作副本（几何算法需要可变 Map），但公共 getter 与 DOM 投影以 kernel 为准，禁止 layout 在未 commit 时被外部当真相源读。

**Tech Stack:** TypeScript, vitest (jsdom), 现有 `createSubState` / `batch` / `deepFreezeSnapshot` / `immutableMap`, `@363045841yyt/klinechart-core`

**Principles (AGENTS.md):**
1. Single Source of Truth — 只经 Actions 写 WritableSignal  
2. Automatic Derivation — 派生只用 computed()  
3. Read/Write Separation — 对外 ReadonlySignal  
4. Effect Isolation — effect 只做 DOM/WebGL 输出  
5. Batched Atomic Updates — 多字段写用 batch()

**Source PRD:** `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` Phase 3  
**P0/P1 done:** `c204d74` kGap; `b1965d3` markerState

---

## Audit findings (code as of 2026-07-15)

### Drawing: three holders today

| Holder | Path | What it stores | Role |
|--------|------|----------------|------|
| **kernel.drawing** | `state/drawingState.ts` | `drawingTool`, `drawings[]` | Intended SSOT; controller signals read this |
| **DrawingStore** | `drawing/index.ts` | `drawings[]`, `selectedId` | Renderer plugins read this every frame |
| **DrawingState class** | `drawing/DrawingState.ts` | `drawings[]`, `selectedDrawingId` | Controller CRUD; writes via adapter → Chart |

**Dual-write bug pattern (same as pre-P1 markers):**

```typescript
// chart.ts setDrawings
this.renderer.getDrawingStore().setAll(drawings)   // store
this.kernel.drawing.actions.setDrawings(drawings)  // kernel
this.scheduleDraw()
```

- `getFullDrawings` / `chart.drawings()` → **kernel**  
- drawing renderer plugins → **DrawingStore**  
- If anything wrote only one side → silent desync  
- `selectedDrawingId` **only** in DrawingStore (and DrawingState class), **not** in kernel

### Pane layout: intentional working copy + commit

| Holder | What | Role |
|--------|------|------|
| **kernel.pane** | `paneRatios`, `paneSpecs` | SSOT for adapters / indicator projection |
| **ChartPaneLayout** | `_internalPaneRatios`, `_paneSpecs`, `paneRenderers` | DOM + resize algorithm + PaneRenderer lifecycle |

Already good:
- `projectState(specs, ratios)` — unidirectional kernel → layout (no reverse write)
- Mutations call `commitLayout()` → `deps.commitLayout` → `kernel.pane.actions.commitLayout`
- Indicator manager uses `projectPaneLayout` after kernel subPane changes

Remaining risks:
- Public methods (`getPaneSpecs`, `getInternalPaneRatios`, `getPaneLayoutSpecs`) can expose **in-flight** local maps mid-algorithm if called mid-mutation
- `_internalPaneRatios` is still a second mutable map, easy to treat as SSOT in new code
- Ratio normalize/resize logic is large and untested as pure functions

### Out of scope for P2

- Full rewrite of drawing interaction / hit-test  
- Merging DrawingState class into DrawingStore (keep controller CRUD class; make it write only via Chart)  
- Rendering dual-path merge (separate perf PR)  
- npm scope rename  

---

## Target end state

```
Controller / DrawingState(class) / UI
        │
        ▼
Chart.setDrawings / setSelectedDrawingId / setDrawingTool
        │  write kernel.drawing.actions
        │  clear nothing heavy (no position cache)
        │  scheduleDraw
        ▼
kernel.drawing  (drawings, drawingTool, selectedDrawingId)
        │  ReadonlySignal
        ▼
DrawingStore (projector) ──► drawing plugins draw()
```

```
User resize / addPane / kernel subPane
        │
        ▼
ChartPaneLayout mutates working copy → pure normalize helpers
        │  commitLayout()
        ▼
kernel.pane  (paneRatios, paneSpecs)
        │  projectState / effect
        ▼
DOM PaneRenderer heights + known pane ids
```

---

## File Structure

| Path | After P2 |
|------|----------|
| `packages/core/src/engine/state/drawingState.ts` | + `selectedDrawingId`; freeze drawings; equal-skip optional |
| `packages/core/src/engine/state/__tests__/drawingState.test.ts` | **新建** 不可变 / selected / clear |
| `packages/core/src/engine/drawing/index.ts` | `DrawingStore` 注入 `drawings$` + `selectedDrawingId$`；删业务数组写 |
| `packages/core/src/engine/drawing/__tests__/drawingStore.projection.test.ts` | **新建** 投影读 + selected |
| `packages/core/src/engine/render/chartRenderer.ts` | 构造 DrawingStore 时注入 kernel signals |
| `packages/core/src/engine/chart.ts` | setDrawings / setSelectedDrawingId 只写 kernel；register DrawingStore 投影 |
| `packages/core/src/engine/drawing/DrawingState.ts` | 保持 CRUD API；确认所有写经 adapter（Chart），不自持长期真相（文档 + 测试） |
| `packages/core/src/engine/layout/paneRatioMath.ts` | **新建** pure: normalizeVisibleRatios, applyBoundaryDelta |
| `packages/core/src/engine/layout/__tests__/paneRatioMath.test.ts` | **新建** 纯函数测试 |
| `packages/core/src/engine/layout/chartPaneLayout.ts` | 算法调 pure；公共读路径先 sync 或只返回 kernel 快照；注释契约 |
| `packages/core/src/engine/state/__tests__/paneState.test.ts` | 已有 commitLayout 测试，必要时扩展 |
| `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` | Phase 3 status 勾选 |

---

## Phase A — drawingState harden + selectedDrawingId

### Task 1: Extend drawingState (TDD)

**Files:**
- Modify: `packages/core/src/engine/state/drawingState.ts`
- Create: `packages/core/src/engine/state/__tests__/drawingState.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/engine/state/__tests__/drawingState.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createDrawingState } from '../drawingState'
import type { DrawingObject } from '../../../foundation/plugin/index'

function mk(id: string, overrides: Partial<DrawingObject> = {}): DrawingObject {
  return {
    id,
    kind: 'trend-line',
    paneId: 'main',
    anchors: [],
    visible: true,
    ...overrides,
  } as DrawingObject
}

describe('drawingState', () => {
  it('freezes drawings snapshot so external mutation cannot corrupt SSOT', () => {
    const state = createDrawingState()
    const list = [mk('a', { style: { stroke: '#f00' } })]
    state.actions.setDrawings(list)
    list[0]!.id = 'hack'
    const stored = state.readonly.drawings.peek()[0]!
    expect(stored.id).toBe('a')
    expect(Object.isFrozen(stored)).toBe(true)
  })

  it('tracks selectedDrawingId and clears when drawing removed via setDrawings', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a'), mk('b')])
    state.actions.setSelectedDrawingId('a')
    expect(state.readonly.selectedDrawingId.peek()).toBe('a')

    state.actions.setDrawings([mk('b')])
    expect(state.readonly.selectedDrawingId.peek()).toBeNull()
  })

  it('setSelectedDrawingId no-ops when unchanged', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a')])
    const listener = vi.fn()
    state.readonly.selectedDrawingId.subscribe(listener)
    state.actions.setSelectedDrawingId('a')
    state.actions.setSelectedDrawingId('a')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clearDrawings clears selection', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a')])
    state.actions.setSelectedDrawingId('a')
    state.actions.clearDrawings()
    expect(state.readonly.drawings.peek()).toEqual([])
    expect(state.readonly.selectedDrawingId.peek()).toBeNull()
  })
})
```

若 `DrawingObject` 必填字段与 stub 不符，以 `packages/core/src/foundation/plugin` 中类型为准补全最小字段。

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/drawingState.test.ts
```

- [ ] **Step 3: Implement drawingState**

```typescript
// packages/core/src/engine/state/drawingState.ts
import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { DrawingToolType } from '../chartTypes'
import type { DrawingObject } from '../../foundation/plugin/index'
import { deepFreezeSnapshot } from './immutable'

function snapshotDrawings(drawings: ReadonlyArray<DrawingObject>): ReadonlyArray<DrawingObject> {
  return Object.freeze(drawings.map((d) => deepFreezeSnapshot({ ...d }) as DrawingObject))
}

export function createDrawingState() {
  const { signals, readonly } = createSubState({
    drawingTool: null as DrawingToolType | null,
    drawings: Object.freeze([]) as ReadonlyArray<DrawingObject>,
    selectedDrawingId: null as string | null,
  })

  return {
    readonly,
    actions: {
      setDrawingTool(tool: DrawingToolType | null) {
        signals.drawingTool.set(tool)
      },
      setDrawings(drawings: ReadonlyArray<DrawingObject>) {
        const next = snapshotDrawings(drawings)
        const selected = signals.selectedDrawingId.peek()
        batch(() => {
          signals.drawings.set(next)
          if (selected && !next.some((d) => d.id === selected)) {
            signals.selectedDrawingId.set(null)
          }
        })
      },
      setSelectedDrawingId(id: string | null) {
        if (signals.selectedDrawingId.peek() === id) return
        if (id !== null && !signals.drawings.peek().some((d) => d.id === id)) {
          // 允许选中不存在 id 时置 null，或直接 return — 与旧 DrawingStore 行为对齐：
          // 旧 store 可 setSelectedId 任意字符串；推荐：允许 set，渲染时找不到则无高亮
          signals.selectedDrawingId.set(id)
          return
        }
        signals.selectedDrawingId.set(id)
      },
      clearDrawings() {
        batch(() => {
          signals.drawings.set(Object.freeze([]))
          signals.selectedDrawingId.set(null)
        })
      },
    },
    dispose() {
      batch(() => {
        signals.drawingTool.set(null)
        signals.drawings.set(Object.freeze([]))
        signals.selectedDrawingId.set(null)
      })
    },
  }
}

export type DrawingStateModule = ReturnType<typeof createDrawingState>
```

**setSelectedDrawingId 策略（锁定）：** 允许设任意 id（含尚未存在），与旧 `DrawingStore.setSelectedId` 一致；`setDrawings` 时若选中 id 不在列表则清 null。

- [ ] **Step 4: Wire flat signals on kernel**

`chartStateKernel.ts` `this.signals` 增加：

```typescript
selectedDrawingId: this.drawing.readonly.selectedDrawingId,
```

`dispose` 已调用 `this.drawing.dispose()` — 确认存在。

- [ ] **Step 5: Tests pass + build**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/drawingState.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

- [ ] **Step 6: Commit** (only if user asks)

```bash
git add packages/core/src/engine/state/drawingState.ts packages/core/src/engine/state/__tests__/drawingState.test.ts packages/core/src/engine/state/chartStateKernel.ts
git commit -m "feat(core): add selectedDrawingId to drawingState SSOT"
```

---

## Phase B — DrawingStore projector

### Task 2: DrawingStore reads kernel signals

**Files:**
- Modify: `packages/core/src/engine/drawing/index.ts` (`DrawingStore` only)
- Create: `packages/core/src/engine/drawing/__tests__/drawingStore.projection.test.ts`
- Modify: `packages/core/src/engine/render/chartRenderer.ts`
- Modify: `packages/core/src/engine/chart.ts`

- [ ] **Step 1: Failing projection test**

```typescript
// packages/core/src/engine/drawing/__tests__/drawingStore.projection.test.ts
import { describe, expect, it } from 'vitest'
import { DrawingStore } from '../index'
import { createDrawingState } from '../../state/drawingState'
import type { DrawingObject } from '../../../foundation/plugin/index'

function mk(id: string, paneId = 'main'): DrawingObject {
  return {
    id,
    kind: 'trend-line',
    paneId,
    anchors: [],
    visible: true,
  } as DrawingObject
}

describe('DrawingStore projection', () => {
  it('reads drawings and selection from injected signals', () => {
    const state = createDrawingState()
    state.actions.setDrawings([mk('a'), mk('b', 'sub')])
    state.actions.setSelectedDrawingId('a')

    const store = new DrawingStore({
      drawings$: state.readonly.drawings,
      selectedDrawingId$: state.readonly.selectedDrawingId,
    })

    expect(store.getAll().map((d) => d.id)).toEqual(['a', 'b'])
    expect(store.getSelectedId()).toBe('a')
    expect(store.getVisibleByPane('main').map((d) => d.id)).toEqual(['a'])

    state.actions.setDrawings([mk('c')])
    expect(store.getAll().map((d) => d.id)).toEqual(['c'])
    expect(store.getSelectedId()).toBeNull() // setDrawings cleared selection
  })
})
```

- [ ] **Step 2: Rewrite DrawingStore**

```typescript
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { DrawingObject } from '../../foundation/plugin/index'

export interface DrawingStoreDeps {
  drawings$: ReadonlySignal<ReadonlyArray<DrawingObject>>
  selectedDrawingId$: ReadonlySignal<string | null>
}

export class DrawingStore {
  constructor(private readonly deps: DrawingStoreDeps) {}

  getSelectedId(): string | null {
    return this.deps.selectedDrawingId$.peek()
  }

  getAll(): DrawingObject[] {
    return [...this.deps.drawings$.peek()]
  }

  getVisibleByPane(paneId: string): DrawingObject[] {
    return this.deps.drawings$
      .peek()
      .filter((drawing) => drawing.visible && drawing.paneId === paneId)
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }

  // 删除: setSelectedId / setAll / upsert / remove / clear 的本地数组写入
}
```

插件若曾调用 `store.setAll` — 必须改为 Chart API。先 rg：

```bash
rg "getDrawingStore\(\)|drawingStore\.(setAll|upsert|remove|clear|setSelectedId)" packages/core/src -n
```

预期仅 `chart.ts` 与测试命中写路径。

- [ ] **Step 3: Inject deps in ChartRenderer**

```typescript
// RendererDependencies
drawings$: DrawingStoreDeps['drawings$']
selectedDrawingId$: DrawingStoreDeps['selectedDrawingId$']

// constructor
this.drawingStore = new DrawingStore({
  drawings$: deps.drawings$,
  selectedDrawingId$: deps.selectedDrawingId$,
})
```

Chart 创建 renderer 时：

```typescript
drawings$: this.kernel.drawing.readonly.drawings,
selectedDrawingId$: this.kernel.drawing.readonly.selectedDrawingId,
```

- [ ] **Step 4: Chart API 只写 kernel**

```typescript
setDrawings(drawings: DrawingObject[]): void {
  this.kernel.drawing.actions.setDrawings(drawings)
  this.scheduleDraw()
}

setSelectedDrawingId(id: string | null): void {
  if (this.kernel.drawing.readonly.selectedDrawingId.peek() === id) return
  this.kernel.drawing.actions.setSelectedDrawingId(id)
  this.scheduleDraw()
}
```

**禁止**再写 `getDrawingStore().setAll`。

- [ ] **Step 5: Chart glue test** (extend chart.dpr.test.ts 或新建)

```typescript
it('routes drawings through kernel for store projection', async () => {
  const chart = new Chart(createDom(1000, 600), defaultOptions)
  const store = chart.renderer /* or getDrawingStore if public */ 
  // 若 getDrawingStore 已有则用它
  const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw')
  const drawing = { id: 'd1', kind: 'trend-line', paneId: 'main', anchors: [], visible: true }

  chart.setDrawings([drawing as any])
  expect(chart.drawings().peek().map((d: any) => d.id)).toEqual(['d1'])
  expect(chart.getDrawingStore?.() /* or via renderer */).toBeDefined()
  // 用 getDrawingStore if exists:
  expect(chart['renderer'].getDrawingStore().getAll().map((d) => d.id)).toEqual(['d1'])
  expect(scheduleDrawSpy).toHaveBeenCalled()

  chart.setSelectedDrawingId('d1')
  expect(chart['renderer'].getDrawingStore().getSelectedId()).toBe('d1')

  await chart.destroy()
})
```

若 `renderer` 为 private，用已有 `getDrawingStore` 公开方法（chartRenderer 已有；Chart 可加 thin wrapper 或测试里通过 setDrawings 后读 kernel + 插件间接验证）。优先在 Chart 上已有访问点：`getDrawingStore` 若不存在则：

```typescript
// chart.ts — 仅测试/交互需要时
getDrawingStore(): DrawingStore {
  return this.renderer.getDrawingStore()
}
```

与 `getMarkerManager` 对称。

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/drawing/__tests__/drawingStore.projection.test.ts src/engine/state/__tests__/drawingState.test.ts src/engine/__tests__/chart.dpr.test.ts src/controllers/__tests__/drawing.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

- [ ] **Step 7: Commit** (only if user asks)

```bash
git commit -m "refactor(core): DrawingStore projects drawings from StateKernel"
```

---

## Phase C — DrawingState class contract (no second SSOT)

### Task 3: Document + verify controller DrawingState only uses adapter

**Files:**
- Modify: `packages/core/src/engine/drawing/DrawingState.ts` (comments only if behavior OK)
- Modify: `packages/core/src/controllers/__tests__/drawing.test.ts` if gaps

**Invariant:** `DrawingState` (class) 的 `this.drawings` 是 **会话缓存**，与 kernel 通过 adapter 同步。P2 不强制删类内数组（交互高频 CRUD 需要本地拷贝），但：

1. 所有写必须 `adapter.setDrawings` / `setSelectedDrawingId`  
2. 不得出现绕过 Chart 的直写 DrawingStore  
3. 可选后续 P2.1：类改为无本地数组、每次读 `adapter.getFullDrawings()`（可能更慢）— **本计划不做**，只加注释与测试锁契约

- [ ] **Step 1: rg 审计**

```bash
rg "new DrawingState|drawingState\.(setDrawings|addOrUpdate)" packages/core/src -n
rg "getDrawingStore\(\)\.(setAll|upsert|clear)" packages/core/src -n
```

Expected after Phase B: 第二组零匹配。

- [ ] **Step 2: Add class-level JSDoc**

```typescript
/**
 * 交互会话层 CRUD。本地 drawings 数组是工作副本；
 * 持久业务 SSOT 是 kernel.drawing，经 DrawingChartAdapter.setDrawings 同步。
 * 禁止直接写 DrawingStore。
 */
```

- [ ] **Step 3: Commit** (only if user asks)

```bash
git commit -m "docs(core): clarify DrawingState is session cache over kernel"
```

---

## Phase D — PaneLayout pure math + read contract

### Task 4: Extract pure pane ratio helpers (TDD)

**Files:**
- Create: `packages/core/src/engine/layout/paneRatioMath.ts`
- Create: `packages/core/src/engine/layout/__tests__/paneRatioMath.test.ts`
- Modify: `packages/core/src/engine/layout/chartPaneLayout.ts` (call pure helpers)

- [ ] **Step 1: Capture current normalize behavior from chart.dpr tests**

已有回归：`allocates initial pane ratios as 3:1:1`、`keeps visible ratio sum at 1 after boundary resize`。pure 函数必须复现这些数值。

- [ ] **Step 2: Write pure function tests first**

```typescript
// packages/core/src/engine/layout/__tests__/paneRatioMath.test.ts
import { describe, expect, it } from 'vitest'
import {
  normalizeVisiblePaneRatios,
  applyBoundaryResize,
} from '../paneRatioMath'

describe('paneRatioMath', () => {
  it('normalizes visible panes to sum 1 and leaves hidden raw', () => {
    const specs = [
      { id: 'main', visible: true },
      { id: 'MACD', visible: true },
      { id: 'hidden', visible: false },
    ]
    const ratios = { main: 3, MACD: 1, hidden: 0.5 }
    const next = normalizeVisiblePaneRatios(specs, ratios)
    expect(next.main + next.MACD).toBeCloseTo(1, 10)
    expect(next.hidden).toBe(0.5)
    expect(next.main / next.MACD).toBeCloseTo(3, 5)
  })

  it('applyBoundaryResize keeps visible sum at 1', () => {
    const specs = [
      { id: 'main', visible: true, minHeightPx: 40 },
      { id: 'MACD', visible: true, minHeightPx: 40 },
      { id: 'RSI', visible: true, minHeightPx: 40 },
    ]
    const ratios = { main: 0.6, MACD: 0.2, RSI: 0.2 }
    const next = applyBoundaryResize({
      specs,
      ratios,
      upperPaneId: 'main',
      deltaY: -20,
      availableHeight: 400,
      defaultMinHeightPx: 40,
    })
    if (next) {
      const sum = next.main + next.MACD + next.RSI
      expect(sum).toBeCloseTo(1, 8)
    }
  })
})
```

实现时从 `chartPaneLayout.ts` 的 `normalizeVisiblePaneRatios` / `resizePaneBoundary` 抽出同等逻辑；若 `applyBoundaryResize` 与 DOM 高度强耦合，可先只抽 **normalize**，boundary 留 Task 5。

- [ ] **Step 3: Implement paneRatioMath.ts** — 从 chartPaneLayout 复制算法，无 DOM 依赖

- [ ] **Step 4: chartPaneLayout 改为调用 pure normalize**

```typescript
import { normalizeVisiblePaneRatios as pureNormalize } from './paneRatioMath'

// 内部方法体改为:
// this._internalPaneRatios = new Map(Object.entries(
//   pureNormalize(this._paneSpecs, Object.fromEntries(this._internalPaneRatios))
// ))
```

- [ ] **Step 5: Existing pane layout tests still pass**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/__tests__/chart.dpr.test.ts src/engine/layout/__tests__/paneRatioMath.test.ts src/engine/state/__tests__/paneState.test.ts
```

- [ ] **Step 6: Commit** (only if user asks)

```bash
git commit -m "refactor(core): extract pure pane ratio normalize helpers"
```

### Task 5: PaneLayout read/write contract hardening

**Files:**
- Modify: `packages/core/src/engine/layout/chartPaneLayout.ts`

- [ ] **Step 1: Document class contract (JSDoc on class)**

```typescript
/**
 * Pane DOM / PaneRenderer 投影器 + 布局算法。
 *
 * SSOT: kernel.pane (paneRatios / paneSpecs)。
 * 本地 _internalPaneRatios / _paneSpecs 仅是算法工作副本：
 * - 入站: projectState(kernel snapshot) 或 applyPaneLayoutSpecs
 * - 出站: 每次突变结束必须 commitLayout() → kernel
 * 禁止在未 commit 的中间态对外暴露为业务真相。
 */
```

- [ ] **Step 2: Public getters sync-from-kernel first where safe**

对 **只读查询**（不在 resize 中间调用的路径）：

```typescript
getInternalPaneRatios(): Map<string, number> {
  this.syncRatiosFromKernel()
  return new Map(this._internalPaneRatios)
}
```

**不要**在 `layoutPanes` 内部循环里调 `syncRatiosFromKernel`（会冲掉算法中间态）。仅公共 getter 与 `setInternalPaneRatio` 入口处 sync。

- [ ] **Step 3: Assert projectState never calls commitLayout**

已有 `layoutPanes({ commit: false })` — 加测试或注释锁定：

```typescript
// projectState 必须 commit:false，否则 indicator reconcile 会回写抖动
```

可选测试：spy `deps.commitLayout`，调用 `projectState`，expect 0 次。

- [ ] **Step 4: Run full core tests + build**

```bash
pnpm --filter @363045841yyt/klinechart-core test
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: all green (1754+).

- [ ] **Step 5: Update PRD Phase 3 status**

```markdown
## Phase 3 status (2026-07-15)
- [x] DrawingStore 无业务 drawings 数组；读 kernel
- [x] selectedDrawingId 进 drawingState
- [x] Chart setDrawings/setSelected 只写 kernel
- [x] pane ratio pure helpers
- [x] ChartPaneLayout 工作副本契约文档化 + 公共读 sync
- [ ] (optional follow-up) DrawingState class 去本地数组
- [ ] (optional) resizePaneBoundary 全量 pure 化
```

- [ ] **Step 6: Commit** (only if user asks)

```bash
git commit -m "refactor(core): harden pane layout kernel projection contract"
```

---

## Acceptance criteria

```bash
# DrawingStore 无本地业务数组字段
rg "private drawings" packages/core/src/engine/drawing/index.ts
# expect: no match (or only comments)

# Chart 不再双写 store
rg "getDrawingStore\(\)\.setAll|drawingStore\.setAll" packages/core/src
# expect: zero

# selectedDrawingId 在 kernel
rg "selectedDrawingId" packages/core/src/engine/state/drawingState.ts
# expect: match

# layout projectState 不回写（人工或测试）
pnpm --filter @363045841yyt/klinechart-core test
pnpm --filter @363045841yyt/klinechart-core build
```

公开 API 保持：
- `chart.setDrawings` / `setSelectedDrawingId` / `drawings()` / `drawingTool`
- controller `DrawingChartAdapter` 形状不变
- `resizePaneBoundary` / `updatePaneLayout` 行为数值兼容

---

## Risk register

| Risk | Mitigation |
|------|------------|
| DrawingObject deepFreeze 破坏交互原地改 anchor | setDrawings 总是替换新对象；交互层 addOrUpdate 传新对象；禁止 mutate frozen |
| DrawingState class 本地数组与 kernel 短暂不一致 | 每次写 adapter 同步；读 hit-test 用 class 本地（会话内一致） |
| DrawingStore 构造注入破坏测试 | rg `new DrawingStore` 全修 |
| pure normalize 与旧浮点不一致 | 用 chart.dpr 回归钉死；toBeCloseTo |
| projectState + commit 死循环 | project 必须 commit:false；测试 spy |
| selectedId 不在 kernel 时 Vue 无法订阅 | Phase A 必须完成 selectedDrawingId signal |

---

## Non-goals

1. 不把 DrawingState class 并入 kernel 单类  
2. 不把 paneRenderers / canvas 进 kernel  
3. 不把 layout 算法整段改成 computed（resize 依赖 DOM 高度与交互 delta）  
4. 不做 WebGPU / 渲染双路径  
5. 不主动 commit / push，除非用户要求  

---

## Suggested execution order

| Order | Task | Why |
|-------|------|-----|
| 1 | Task 1 drawingState + selected | 解锁 projector |
| 2 | Task 2 DrawingStore projector | 消灭双写（最高价值） |
| 3 | Task 3 DrawingState contract | 低成本锁契约 |
| 4 | Task 4 paneRatioMath | 可测布局 |
| 5 | Task 5 layout contract | 文档 + 读路径硬化 |

可拆两个 PR：`P2a drawing`（Tasks 1–3）、`P2b pane layout`（Tasks 4–5）。

---

## Self-review

**Spec coverage**
- PRD 审计 DrawingStore vs drawingState → Tasks 1–3  
- PRD ChartPaneLayout computed 适配 → Task 4–5（pure + 工作副本契约，非硬 computed）  
- P1 教训：唯一写入口 + glue 测试 → Task 2 Chart tests  

**Placeholder scan:** 无 TBD；步骤含代码与命令  

**Type consistency:** `DrawingStoreDeps`, `selectedDrawingId`, `normalizeVisiblePaneRatios` 命名全任务一致  

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-15-drawing-pane-layout-P2.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每 Task 新 subagent + review  
2. **Inline Execution** — 本会话 executing-plans  

**Which approach?** 也可先只做 **P2a（drawing Tasks 1–3）** 再开 P2b。
