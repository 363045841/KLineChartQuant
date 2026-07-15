# Main Indicator State → StateKernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `ChartIndicatorManager._mainIndicatorsSignal` 迁入 StateKernel，使主图指标启停/参数成为 chart 域 SSOT；manager 只做命令式副作用（renderer/scheduler/draw）。

**Architecture:** 新建 `indicatorState` 子状态模块（`createSubState` + actions），挂到 `ChartStateKernel`。`ChartIndicatorManager` 不再持有 WritableSignal；读写经 deps 注入的 kernel readonly + actions。`indicators` / `subPanes` 派生可继续留在 manager——本计划优先 SSOT 迁移，派生信号保持现有对外 API 形状不变。`scheduler._busySignal` **不迁入 kernel**（调度运行时瞬态，非 chart 域配置）。

**Tech Stack:** TypeScript, vitest, 现有 `createSubState` / `ReadonlySignal` / `batch` / `actions` 模式（对齐 `comparisonState.ts` / `optionsState.ts`）

---

## Scope

### In scope
- `MainIndicatorEntry` map（id → params）进 kernel
- enable / disable / updateParams / clear / setActive 经 actions
- manager 读 `readonly`、写 `actions`；删本地 `createSignal`
- kernel `signals` bag 暴露 `mainIndicators` 供 framework adapter
- 公开 API 类型：`chart.viewport` 等 Writable cast 顺手改为 `ReadonlySignal`
- 现有 `chartIndicatorManager` 单测适配

### Out of scope
- `IndicatorScheduler._busySignal`（运行时 busy 标志，不是配置 SSOT）
- `SubPaneManager` 命令式 registry 整包迁 kernel（entries 已 ReadonlySignal；更大迁移另开计划）
- Plugin StateStore / 指标计算结果 stateKey
- Vue/React binding 大改（仅消费 ReadonlySignal，形状不变即可）

---

## File Structure

| Path | Role after change |
|------|-------------------|
| `packages/core/src/engine/state/indicatorState.ts` | **新建** mainIndicators Map + semantic actions |
| `packages/core/src/engine/state/chartStateKernel.ts` | 组合 `indicator` 子模块；signals/actions bag 挂载 |
| `packages/core/src/engine/state/index.ts` | re-export |
| `packages/core/src/engine/indicators/chartIndicatorManager.ts` | 删 `_mainIndicatorsSignal`；经 deps 读写 kernel |
| `packages/core/src/engine/chart.ts` | 注入 deps；timeshare 保存/恢复读 kernel；`viewport` 返回 ReadonlySignal |
| `packages/core/src/engine/viewport/chartViewportManager.ts` | `viewportSignal` 返回 ReadonlySignal |
| `packages/core/src/engine/render/chartRenderer.ts` | `mainIndicatorsSignalPeek` → kernel peek 或 deps |
| `packages/core/src/engine/indicators/__tests__/chartIndicatorManager.test.ts` | mock deps 提供 indicator state |

---

## Data model

```typescript
// 与现有 MainIndicatorEntry 对齐：存在 = 激活
export type MainIndicatorEntry = {
  params: Record<string, number | boolean | string>
}

// kernel 内存储（不可变替换，禁止 in-place Map mutation）
// ReadonlyMap<string, MainIndicatorEntry>
// key: indicatorId.toUpperCase() e.g. 'MA', 'BOLL'
```

**Action 语义（仅写 signal，不碰 DOM/renderer）：**

| Action | 行为 |
|--------|------|
| `upsert(id, params)` | 新建或合并 params；`Map` 拷贝后 `set` |
| `remove(id)` | 删除条目 |
| `setParams(id, params)` | 仅当 id 存在时替换/合并 params |
| `replaceAll(entries)` | 整表替换（`setActiveMainIndicators` / clear / restore） |
| `clear()` | `replaceAll(new Map())` |

Manager 在 action **之后** 调用现有 `enableMainIndicatorRenderer` / `disableMainIndicatorRenderer` / `updateIndicatorSchedulerConfig` / `scheduleDraw`。

---

### Task 1: Create indicatorState module + failing unit tests

**Files:**
- Create: `packages/core/src/engine/state/indicatorState.ts`
- Create: `packages/core/src/engine/state/__tests__/indicatorState.test.ts`
- Modify: `packages/core/src/engine/state/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/engine/state/__tests__/indicatorState.test.ts
import { describe, it, expect } from 'vitest'
import { createIndicatorState } from '../indicatorState'

describe('indicatorState', () => {
  it('upsert adds and merges params immutably', () => {
    const m = createIndicatorState()
    m.actions.upsert('MA', { period: 5 })
    expect(m.readonly.mainIndicators().get('MA')?.params).toEqual({ period: 5 })
    const first = m.readonly.mainIndicators()
    m.actions.upsert('MA', { period: 10, color: 'red' })
    const second = m.readonly.mainIndicators()
    expect(second).not.toBe(first)
    expect(second.get('MA')?.params).toEqual({ period: 10, color: 'red' })
    expect(first.get('MA')?.params).toEqual({ period: 5 })
  })

  it('remove and clear', () => {
    const m = createIndicatorState()
    m.actions.upsert('MA', {})
    m.actions.upsert('BOLL', {})
    m.actions.remove('MA')
    expect(m.readonly.mainIndicators().has('MA')).toBe(false)
    expect(m.readonly.mainIndicators().has('BOLL')).toBe(true)
    m.actions.clear()
    expect(m.readonly.mainIndicators().size).toBe(0)
  })

  it('readonly has no set at runtime', () => {
    const m = createIndicatorState()
    expect((m.readonly.mainIndicators as any).set).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — expect fail (module missing)**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/engine/state/__tests__/indicatorState.test.ts
```

- [ ] **Step 3: Implement indicatorState**

```typescript
// packages/core/src/engine/state/indicatorState.ts
import { createSubState, batch } from '../../foundation/reactivity/signal'

export type MainIndicatorEntry = {
  params: Record<string, number | boolean | string>
}

export function createIndicatorState() {
  const { signals, readonly } = createSubState({
    mainIndicators: new Map<string, MainIndicatorEntry>() as ReadonlyMap<
      string,
      MainIndicatorEntry
    >,
  })

  const write = (next: Map<string, MainIndicatorEntry>) => {
    signals.mainIndicators.set(next)
  }

  return {
    readonly,
    actions: {
      upsert(id: string, params: Record<string, number | boolean | string>) {
        const key = id.toUpperCase()
        const prev = signals.mainIndicators.peek()
        const existing = prev.get(key)
        const next = new Map(prev)
        next.set(key, {
          params: existing ? { ...existing.params, ...params } : { ...params },
        })
        write(next)
      },
      remove(id: string) {
        const key = id.toUpperCase()
        const prev = signals.mainIndicators.peek()
        if (!prev.has(key)) return
        const next = new Map(prev)
        next.delete(key)
        write(next)
      },
      setParams(id: string, params: Record<string, number | boolean | string>) {
        const key = id.toUpperCase()
        const prev = signals.mainIndicators.peek()
        const existing = prev.get(key)
        if (!existing) return
        const next = new Map(prev)
        next.set(key, { params: { ...existing.params, ...params } })
        write(next)
      },
      replaceAll(entries: ReadonlyMap<string, MainIndicatorEntry>) {
        write(new Map(entries))
      },
      clear() {
        write(new Map())
      },
    },
    dispose() {
      batch(() => {
        signals.mainIndicators.set(new Map())
      })
    },
  }
}

export type IndicatorStateModule = ReturnType<typeof createIndicatorState>
```

- [ ] **Step 4: Export from `state/index.ts`**

- [ ] **Step 5: Re-run unit tests — expect PASS**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/engine/state/__tests__/indicatorState.test.ts
```

---

### Task 2: Wire ChartStateKernel

**Files:**
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`

- [ ] **Step 1: Add module field**

```typescript
readonly indicator: IndicatorStateModule
// constructor:
this.indicator = createIndicatorState()
```

- [ ] **Step 2: Flatten signals / actions bag**

```typescript
// signals:
mainIndicators: this.indicator.readonly.mainIndicators,

// actions:
upsertMainIndicator: (id, params) => this.indicator.actions.upsert(id, params),
removeMainIndicator: (id) => this.indicator.actions.remove(id),
setMainIndicatorParams: (id, params) => this.indicator.actions.setParams(id, params),
replaceMainIndicators: (entries) => this.indicator.actions.replaceAll(entries),
clearMainIndicators: () => this.indicator.actions.clear(),
```

- [ ] **Step 3: dispose**

```typescript
this.indicator.dispose()
```

- [ ] **Step 4: Build**

```bash
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: pass (manager still uses own signal until Task 3).

---

### Task 3: Refactor ChartIndicatorManager to use kernel via deps

**Files:**
- Modify: `packages/core/src/engine/indicators/chartIndicatorManager.ts`
- Modify: `packages/core/src/engine/chart.ts` (deps injection)
- Modify: `packages/core/src/engine/indicators/__tests__/chartIndicatorManager.test.ts`
- Modify: `packages/core/src/engine/render/chartRenderer.ts` if it still peeks manager

- [ ] **Step 1: Extend IndicatorDependencies**

```typescript
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { MainIndicatorEntry } from '../state/indicatorState'

export interface IndicatorDependencies {
  // existing fields...
  mainIndicators$: ReadonlySignal<ReadonlyMap<string, MainIndicatorEntry>>
  upsertMainIndicator: (
    id: string,
    params: Record<string, number | boolean | string>,
  ) => void
  removeMainIndicator: (id: string) => void
  setMainIndicatorParams: (
    id: string,
    params: Record<string, number | boolean | string>,
  ) => void
  replaceMainIndicators: (entries: ReadonlyMap<string, MainIndicatorEntry>) => void
  clearMainIndicators: () => void
}
```

- [ ] **Step 2: Delete local signal**

Remove:
```typescript
private _mainIndicatorsSignal: Signal<Map<string, MainIndicatorEntry>>
this._mainIndicatorsSignal = createSignal(...)
```

- [ ] **Step 3: Rewrite main indicator APIs**

Pattern for `enableMainIndicator`:

```typescript
enableMainIndicator(indicatorId: string, params?: Record<string, number | boolean | string>): boolean {
  const id = indicatorId.toUpperCase()
  if (!ChartIndicatorManager.ENABLE_MAIN_INDICATORS.includes(id)) {
    console.warn(`[Chart] 未知的主图指标: ${indicatorId}`)
    return false
  }
  const map = this.deps.mainIndicators$.peek()
  const existing = map.get(id)
  if (existing) {
    if (params) {
      this.deps.upsertMainIndicator(id, params)
      this.updateIndicatorSchedulerConfig(id)
    }
    return true
  }
  const defaults = ChartIndicatorManager.DEFAULT_MAIN_PARAMS[id] ?? {}
  const merged = params ? { ...defaults, ...params } : defaults
  this.deps.upsertMainIndicator(id, merged)
  this.enableMainIndicatorRenderer(id)
  this.updateIndicatorSchedulerConfig(id)
  this.deps.scheduleDraw()
  return true
}
```

同样改写：`disableMainIndicator` → `removeMainIndicator` + disable renderer；`updateMainIndicatorParams` → `setMainIndicatorParams`；`clearMainIndicators` → `clearMainIndicators` + disable all renderers；`getActiveMainIndicators` / `isMainIndicatorActive` / `getMainIndicatorParams` / `mainIndicatorsSignalPeek` 全部读 `mainIndicators$.peek()`。

- [ ] **Step 4: Rewrite `_indicatorsComputed`**

```typescript
this._indicatorsComputed = computed(() => {
  const mainIndicators: IndicatorInstance[] = [...this.deps.mainIndicators$().entries()].map(
    ([id, entry]) => ({
      id,
      definitionId: id,
      label: id,
      name: id,
      role: 'main' as const,
      params: { ...entry.params },
    }),
  )
  // subIndicators unchanged via subPaneManager.entriesSignal()
  return [...mainIndicators, ...subIndicators]
})
```

- [ ] **Step 5: Wire chart.ts constructor**

```typescript
this.indicatorManager = new ChartIndicatorManager({
  // existing deps...
  mainIndicators$: this.kernel.indicator.readonly.mainIndicators,
  upsertMainIndicator: (id, params) => this.kernel.indicator.actions.upsert(id, params),
  removeMainIndicator: (id) => this.kernel.indicator.actions.remove(id),
  setMainIndicatorParams: (id, params) => this.kernel.indicator.actions.setParams(id, params),
  replaceMainIndicators: (entries) => this.kernel.indicator.actions.replaceAll(entries),
  clearMainIndicators: () => this.kernel.indicator.actions.clear(),
})
```

- [ ] **Step 6: timeshare save/restore**

`chart.ts` 中：
```typescript
// before
for (const [id, entry] of this.indicatorManager.mainIndicatorsSignalPeek)

// after
for (const [id, entry] of this.kernel.indicator.readonly.mainIndicators.peek())
```

恢复路径继续调用 `enableMainIndicator`（会写 kernel + 副作用）。

- [ ] **Step 7: chartRenderer**

保留 `mainIndicatorsSignalPeek` getter，实现改为：
```typescript
return this.deps.mainIndicators$.peek()
```

- [ ] **Step 8: Fix unit test fixtures**

`chartIndicatorManager.test.ts`：构造假的 `mainIndicators$` + action mocks（可用 `createIndicatorState()` 真实例注入，最稳）。

- [ ] **Step 9: Verify**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- src/engine/indicators/__tests__/chartIndicatorManager.test.ts src/engine/state/__tests__/indicatorState.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

- [ ] **Step 10: Grep gates**

```bash
rg "_mainIndicatorsSignal|createSignal" packages/core/src/engine/indicators/chartIndicatorManager.ts
```

Expected: no `_mainIndicatorsSignal`; no `createSignal` in that file.

---

### Task 4: API surface ReadonlySignal cleanup (small)

**Files:**
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/engine/viewport/chartViewportManager.ts`

- [ ] **Step 1: Fix return types**

```typescript
// chart.ts
get viewport(): ReadonlySignal<ViewportState> {
  return this.viewportManager.viewportSignal
}

// chartViewportManager.ts
get viewportSignal(): ReadonlySignal<ViewportState> {
  return this.kernel.viewport.readonly.viewportState
}
```

Delete `as unknown as Signal<ViewportState>` casts.

- [ ] **Step 2: Fix any TS fallout in controller/tests**

```bash
pnpm --filter @363045841yyt/klinechart-core build
pnpm --filter @363045841yyt/klinechart-core test -- --exclude src/rendering/render/__tests__/webglRenderer.test.ts
```

---

### Task 5: Full verification

- [ ] **Step 1: Full core suite**

```bash
pnpm --filter @363045841yyt/klinechart-core test -- --exclude src/rendering/render/__tests__/webglRenderer.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: all pass (known WebGL canvas failures excluded).

- [ ] **Step 2: Grep remaining engine WritableSignal domain state**

```bash
rg "createSignal\(" packages/core/src/engine -n
```

Allowlist only:
- `subPaneManager.ts`（命令式 registry + Readonly 暴露）
- `scheduler.ts` `_busySignal`（运行时）
- `chartDataManager.ts` timeshare fallback empty signals
- tests

- [ ] **Step 3: Commit only when user asks**

Suggested message:
```
refactor(core): move main indicator map into StateKernel

ChartIndicatorManager no longer owns WritableSignal; enable/disable
params flow through indicatorState actions. Renderer/scheduler remain
imperative side effects after Action writes.
```

---

## Risk notes

| Risk | Mitigation |
|------|------------|
| Immutable Map 忘记拷贝导致共享 mutation | Actions 一律 `new Map(prev)`；单测断言 identity 变化 |
| enable 时先写 signal 后 renderer 失败 | 保持现有顺序；失败路径极少，不引入两阶段事务 |
| timeshare 切换丢指标 | save/restore 改读 kernel peek；加/保留现有 mode 测试路径 |
| computed 依赖未追踪 | `_indicatorsComputed` 必须调用 `mainIndicators$()` 而非仅 peek |
| 测试 mock 不完整 | fixture 直接 `createIndicatorState()` 注入 |

---

## Principle checklist

| Principle | How this plan satisfies |
|-----------|-------------------------|
| SSOT | 主图指标 Map 仅 kernel `mainIndicators` |
| Automatic derivation | `indicatorsComputed` 读 kernel signal |
| R/W separation | 对外 ReadonlySignal；actions only |
| Effect isolation | 无 effect 写 signal；manager 副作用在 action 后 |
| Batch | dispose/clear 用 batch；单字段 upsert 可不 batch |

---

## Execution handoff

Plan saved to `.opencode/plans/2026-07-14-indicator-state-kernel.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task + review  
2. **Inline Execution** — same session with checkpoints  

Which approach?
