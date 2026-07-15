# Marker State Kernel Migration (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `MarkerManager` 内持久业务状态 `customMarkers` 迁入 StateKernel，使自定义标记增删改走 kernel actions，Manager 只保留帧级 runtime（位置缓存 / 瞬时 hit-test 实体 / hover）。

**Architecture:** 新增 `markerState` 子状态（`createSubState` + immutable 快照），挂到 `ChartStateKernel`。`Chart.updateCustomMarkers` / `clearCustomMarkers` 只写 kernel 并 `scheduleDraw`。`MarkerManager` 通过注入的 `ReadonlySignal` 读自定义标记，删除内部 `customMarkers` Map。帧级 `markers`、`customMarkerPositions`、`hoveredMarkerId` 仍留在 Manager（非业务 SSOT）。`showVolumePriceMarkers` / `showExtremaMarkers` 已是 settings 开关且按帧计算，**不**做成实体列表进 kernel。

**Tech Stack:** TypeScript, vitest, 现有 `createSubState` / `batch` / `immutableMap` / `deepFreezeSnapshot`, `@363045841yyt/klinechart-core`

**Principles (AGENTS.md):**
1. Single Source of Truth — 只经 Actions 写 WritableSignal  
2. Automatic Derivation — 派生只用 computed()  
3. Read/Write Separation — 对外 ReadonlySignal  
4. Effect Isolation — effect 只做 DOM/WebGL 输出  
5. Batched Atomic Updates — 多字段写用 batch()

**Source PRD:** `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` Phase 2

**P0 gate (done):** `c204d74` kGap 统一 + 手势 zoom redraw

---

## Scope clarification (vs PRD wording)

| PRD 原文 | 代码实况 | P1 处理 |
|----------|----------|--------|
| `customMarkers` 进 kernel | `MarkerManager.customMarkers: Map` | **迁入** `markerState` |
| `extremaMarkers` 进 kernel | `extremaMarkers` 渲染器每帧从 data 算，无实体存储 | **不做**（settings 已有 `showExtremaMarkers`） |
| `volumePriceMarkers` 进 kernel | candle 每帧计算 relation，`register` 瞬时 `MarkerEntity` | **不做**（settings 已有 `showVolumePriceMarkers`；瞬时 hit 实体留 Manager） |
| Manager 变投影器 | 现兼业务 Map + 帧 runtime | 业务读 kernel；帧 runtime 保留 |

**验收（本计划）：**
- `rg "private customMarkers" packages/core/src/engine` → 零匹配  
- `Chart.updateCustomMarkers` / `clearCustomMarkers` 只写 `kernel.marker.actions`  
- `MarkerManager.getCustomMarkers()` 读注入的 readonly signal  
- `pnpm --filter @363045841yyt/klinechart-core test` 相关套件绿  
- `pnpm --filter @363045841yyt/klinechart-core build` 通过  
- **仅在用户明确要求时 commit**

---

## File Structure

| Path | Responsibility after P1 |
|------|-------------------------|
| `packages/core/src/engine/state/markerState.ts` | **新建** customMarkers 业务 SSOT + actions |
| `packages/core/src/engine/state/__tests__/markerState.test.ts` | **新建** 不可变 / equal skip / clear / replaceAll |
| `packages/core/src/engine/state/chartStateKernel.ts` | 挂 `marker` 模块；flat `signals` / `actions`；dispose |
| `packages/core/src/engine/state/index.ts` | re-export markerState |
| `packages/core/src/engine/marker/registry.ts` | 删 `customMarkers` Map；注入 `customMarkers$`；改 get/set/clear API |
| `packages/core/src/engine/render/chartRenderer.ts` | 构造 `MarkerManager` 时注入 kernel signal |
| `packages/core/src/engine/chart.ts` | `updateCustomMarkers` / `clearCustomMarkers` → kernel + scheduleDraw |
| `packages/core/src/engine/marker/__tests__/markerManager.customMarkers.test.ts` | **新建** Manager 读 signal、不持有业务 Map |
| `packages/core/src/engine/controller/__tests__/interaction.dpr.test.ts` | 若构造 MarkerManager 签名变了则同步 mock |
| `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md` | 勾选 Phase 2 完成说明（可选文档任务） |

**不改（公开 API 形状保持）：**
- `createChartController.updateCustomMarkers` / `clearCustomMarkers` 仍调 `chart.*`  
- `SemanticChartController` / `MarkerManagerLike` 接口字段名  
- customMarkers / extrema / volumePrice 渲染器逻辑（只换数据来源）

---

## Design

### markerState shape

```typescript
// packages/core/src/engine/state/markerState.ts
// customMarkers: ReadonlyMap<id, CustomMarkerEntity>  // immutableMap 包装
// actions:
//   setCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>)  // replaceAll
//   registerCustomMarker(marker: CustomMarkerEntity)              // upsert by id
//   clearCustomMarkers()
// dispose() → empty map
```

实体写入前 `deepFreezeSnapshot`（style / label / offset / metadata 嵌套冻结）。  
`setCustomMarkers` 与当前 map 内容深度相等时可跳过通知（与 subPane equal-upsert 一致）。

### MarkerManager after

```
业务: customMarkers$  (ReadonlySignal)  ← kernel
帧 runtime:
  markers: Map              ← volume-price 等瞬时 hit 实体
  customMarkerPositions     ← render 写、hitTest 读
  hoveredMarkerId           ← 交互瞬态（interactionState 已有 hover 镜像）
```

```typescript
export interface MarkerManagerDeps {
  customMarkers$: ReadonlySignal<ReadonlyMap<string, CustomMarkerEntity>>
}

getCustomMarkers(): CustomMarkerEntity[] {
  return [...this.deps.customMarkers$.peek().values()]
}

// setCustomMarkers / clearCustomMarkers / registerCustomMarker 从 Manager 删除
// 调用方改走 kernel actions（Chart 公开 API 不变）
```

### Data flow

```
Semantic / Controller
    → chart.updateCustomMarkers(list)
        → kernel.marker.actions.setCustomMarkers(list)
        → scheduleDraw()
            → customMarkers renderer
                → markerManager.getCustomMarkers()  // 读 signal
                → setCustomMarkerPosition(...)      // 帧 cache
```

---

### Task 1: markerState module + unit tests (TDD)

**Files:**
- Create: `packages/core/src/engine/state/markerState.ts`
- Create: `packages/core/src/engine/state/__tests__/markerState.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/engine/state/__tests__/markerState.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createMarkerState } from '../markerState'
import type { CustomMarkerEntity } from '../../marker/registry'

function mk(id: string, overrides: Partial<CustomMarkerEntity> = {}): CustomMarkerEntity {
  return {
    id,
    date: '2025-01-15',
    timestamp: Date.UTC(2025, 0, 15, -8, 0, 0, 0),
    shape: 'circle',
    ...overrides,
  }
}

describe('markerState', () => {
  it('publishes immutable custom marker snapshots', () => {
    const state = createMarkerState()
    const style = { size: 12, fillColor: '#f00' }
    state.actions.setCustomMarkers([mk('a', { style })])
    style.size = 99

    const stored = state.readonly.customMarkers.peek().get('a')!
    expect(stored.style).toEqual({ size: 12, fillColor: '#f00' })
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.style)).toBe(true)
    expect(() => {
      ;(stored as { id: string }).id = 'hack'
    }).toThrow()
  })

  it('does not notify when setCustomMarkers is deeply equal', () => {
    const state = createMarkerState()
    const listener = vi.fn()
    state.readonly.customMarkers.subscribe(listener)

    state.actions.setCustomMarkers([mk('a')])
    state.actions.setCustomMarkers([mk('a')])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('registerCustomMarker upserts by id', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a', { shape: 'circle' })])
    state.actions.registerCustomMarker(mk('a', { shape: 'flag' }))
    state.actions.registerCustomMarker(mk('b', { shape: 'diamond' }))

    const map = state.readonly.customMarkers.peek()
    expect(map.size).toBe(2)
    expect(map.get('a')!.shape).toBe('flag')
    expect(map.get('b')!.shape).toBe('diamond')
  })

  it('clearCustomMarkers empties the map', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a'), mk('b')])
    state.actions.clearCustomMarkers()
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })

  it('rejects non JSON-like metadata', () => {
    const state = createMarkerState()
    expect(() =>
      state.actions.setCustomMarkers([mk('a', { metadata: { d: new Date() } })]),
    ).toThrow(TypeError)
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })

  it('dispose resets to empty', () => {
    const state = createMarkerState()
    state.actions.setCustomMarkers([mk('a')])
    state.dispose()
    expect(state.readonly.customMarkers.peek().size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/markerState.test.ts
```

Expected: cannot find module `../markerState` or similar.

- [ ] **Step 3: Implement markerState**

```typescript
// packages/core/src/engine/state/markerState.ts
import { batch, createSubState } from '../../foundation/reactivity/signal'
import { deepFreezeSnapshot, immutableMap } from './immutable'
import type { CustomMarkerEntity } from '../marker/registry'

function snapshotMarker(marker: CustomMarkerEntity): CustomMarkerEntity {
  return deepFreezeSnapshot({ ...marker }) as CustomMarkerEntity
}

function snapshotMap(
  markers: ReadonlyArray<CustomMarkerEntity> | ReadonlyMap<string, CustomMarkerEntity>,
): ReadonlyMap<string, CustomMarkerEntity> {
  const next = new Map<string, CustomMarkerEntity>()
  if (markers instanceof Map || (typeof (markers as Map<string, CustomMarkerEntity>).forEach === 'function' && 'get' in markers)) {
    for (const [id, marker] of markers as ReadonlyMap<string, CustomMarkerEntity>) {
      next.set(id, snapshotMarker(marker))
    }
  } else {
    for (const marker of markers as ReadonlyArray<CustomMarkerEntity>) {
      next.set(marker.id, snapshotMarker(marker))
    }
  }
  return immutableMap(next)
}

function mapsEqual(
  left: ReadonlyMap<string, CustomMarkerEntity>,
  right: ReadonlyMap<string, CustomMarkerEntity>,
): boolean {
  if (left.size !== right.size) return false
  for (const [id, marker] of right) {
    const prev = left.get(id)
    if (!prev) return false
    // deepFreezeSnapshot 后引用不等；用 JSON 稳定比较 JSON-like 字段
    if (JSON.stringify(prev) !== JSON.stringify(marker)) return false
  }
  return true
}

export function createMarkerState() {
  const { signals, readonly } = createSubState({
    customMarkers: immutableMap(new Map<string, CustomMarkerEntity>()),
  })

  const write = (next: ReadonlyMap<string, CustomMarkerEntity>) => {
    const prev = signals.customMarkers.peek()
    if (mapsEqual(prev, next)) return
    signals.customMarkers.set(next)
  }

  return {
    readonly,
    actions: {
      setCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>) {
        write(snapshotMap(markers))
      },
      registerCustomMarker(marker: CustomMarkerEntity) {
        const next = new Map(signals.customMarkers.peek())
        next.set(marker.id, snapshotMarker(marker))
        write(immutableMap(next))
      },
      clearCustomMarkers() {
        if (signals.customMarkers.peek().size === 0) return
        write(immutableMap(new Map()))
      },
    },
    dispose() {
      batch(() => {
        signals.customMarkers.set(immutableMap(new Map()))
      })
    },
  }
}

export type MarkerStateModule = ReturnType<typeof createMarkerState>
```

注意：`snapshotMap` 实现里对 `ReadonlyMap` 的检测可简化为只接受 `ReadonlyArray` 入参（`setCustomMarkers`）+ `register` 单条；不要过度设计。最终实现优先清晰：

```typescript
setCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>) {
  const next = new Map<string, CustomMarkerEntity>()
  for (const marker of markers) {
    next.set(marker.id, snapshotMarker(marker))
  }
  write(immutableMap(next))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/state/__tests__/markerState.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit** (only if user asks)

```bash
git add packages/core/src/engine/state/markerState.ts packages/core/src/engine/state/__tests__/markerState.test.ts
git commit -m "feat(core): add markerState for customMarkers SSOT"
```

---

### Task 2: Wire marker into ChartStateKernel

**Files:**
- Modify: `packages/core/src/engine/state/chartStateKernel.ts`
- Modify: `packages/core/src/engine/state/index.ts`

- [ ] **Step 1: Export from index**

在 `packages/core/src/engine/state/index.ts` 增加：

```typescript
export { createMarkerState, type MarkerStateModule } from './markerState'
```

- [ ] **Step 2: Mount on kernel**

在 `chartStateKernel.ts`：

1. import `createMarkerState`, `MarkerStateModule`
2. 类字段：`readonly marker: MarkerStateModule`
3. 构造：`this.marker = createMarkerState()`（可放在 `this.subPane = ...` 之后）
4. `this.signals` 增加：
   ```typescript
   customMarkers: this.marker.readonly.customMarkers,
   ```
5. `this.actions` 增加：
   ```typescript
   setCustomMarkers: (markers: ReadonlyArray<CustomMarkerEntity>) =>
     this.marker.actions.setCustomMarkers(markers),
   registerCustomMarker: (marker: CustomMarkerEntity) =>
     this.marker.actions.registerCustomMarker(marker),
   clearCustomMarkers: () => this.marker.actions.clearCustomMarkers(),
   ```
6. `dispose()` 增加：`this.marker.dispose()`

`CustomMarkerEntity` 类型已在该文件 import。

- [ ] **Step 3: Typecheck / build**

```bash
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: pass.

- [ ] **Step 4: Commit** (only if user asks)

```bash
git add packages/core/src/engine/state/chartStateKernel.ts packages/core/src/engine/state/index.ts
git commit -m "feat(core): mount markerState on ChartStateKernel"
```

---

### Task 3: MarkerManager reads signal; drop business Map

**Files:**
- Modify: `packages/core/src/engine/marker/registry.ts`
- Create: `packages/core/src/engine/marker/__tests__/markerManager.customMarkers.test.ts`
- Modify: `packages/core/src/engine/render/chartRenderer.ts`
- Modify: any test that `new MarkerManager()` without deps

- [ ] **Step 1: Write failing Manager test**

```typescript
// packages/core/src/engine/marker/__tests__/markerManager.customMarkers.test.ts
import { describe, expect, it } from 'vitest'
import { createSignal } from '../../../foundation/reactivity/signal'
import { MarkerManager, type CustomMarkerEntity } from '../registry'
import { immutableMap } from '../../state/immutable'

function mk(id: string): CustomMarkerEntity {
  return {
    id,
    date: '2025-01-15',
    timestamp: 1,
    shape: 'circle',
  }
}

describe('MarkerManager customMarkers projection', () => {
  it('reads custom markers from injected signal, not local map', () => {
    const customMarkers = createSignal(immutableMap(new Map([['a', mk('a')]])))
    const manager = new MarkerManager({
      customMarkers$: Object.assign(() => customMarkers(), {
        peek: customMarkers.peek,
        subscribe: customMarkers.subscribe,
      }),
    })

    expect(manager.getCustomMarkers().map((m) => m.id)).toEqual(['a'])

    customMarkers.set(immutableMap(new Map([['b', mk('b')]])))
    expect(manager.getCustomMarkers().map((m) => m.id)).toEqual(['b'])
  })

  it('still caches positions for hitTest independently of business state', () => {
    const customMarkers = createSignal(immutableMap(new Map([['a', mk('a')]])))
    const manager = new MarkerManager({
      customMarkers$: Object.assign(() => customMarkers(), {
        peek: customMarkers.peek,
        subscribe: customMarkers.subscribe,
      }),
    })
    manager.setCustomMarkerPosition('a', 10, 20, 12, 'circle')
    // hitTestCustomMarker 行为保持：有 position 才可命中
    expect(manager.hitTestCustomMarker(10, 20)?.id).toBe('a')
  })
})
```

若项目里 `createSignal` 未导出，改用 `createMarkerState` 作为 signal 源更稳：

```typescript
const state = createMarkerState()
state.actions.setCustomMarkers([mk('a')])
const manager = new MarkerManager({ customMarkers$: state.readonly.customMarkers })
```

优先第二种，避免依赖内部 `createSignal` 导出。

- [ ] **Step 2: Change MarkerManager constructor**

```typescript
// registry.ts 关键
import type { ReadonlySignal } from '../../foundation/reactivity/signal'

export interface MarkerManagerDeps {
  customMarkers$: ReadonlySignal<ReadonlyMap<string, CustomMarkerEntity>>
}

export class MarkerManager {
  private readonly deps: MarkerManagerDeps
  // 删除: private customMarkers: Map<...>

  constructor(deps: MarkerManagerDeps) {
    this.deps = deps
  }

  getCustomMarkers(): CustomMarkerEntity[] {
    return [...this.deps.customMarkers$.peek().values()]
  }

  // 删除: registerCustomMarker / setCustomMarkers / clearCustomMarkers 的 Map 写入
  // 若 clearCustomMarkers 仍被渲染侧误调，改为 no-op 并 @deprecated，或直接删除让 TS 报错
}
```

`clearCustomMarkers` 若还清 `customMarkerPositions`，拆成：

```typescript
clearPositionCache(): void {
  this.customMarkerPositions.clear()
}
```

并在 Chart 清标记后调用（见 Task 4）。

- [ ] **Step 3: chartRenderer 注入 deps**

`ChartRenderer` 目前 `this.markerManager = new MarkerManager()`。需要能访问 kernel signal。

两种接法（选 A，侵入小）：

**A.** `ChartRenderer` 构造参数增加 `markerManagerDeps` 或 `customMarkers$`：

```typescript
// chartRenderer 构造
this.markerManager = new MarkerManager({
  customMarkers$: deps.customMarkers$,
})
```

**B.** Chart 创建后再 `renderer.attachMarkerDeps(...)` — 避免，时序脆。

在 `chart.ts` 创建 renderer 处传入 `this.kernel.marker.readonly.customMarkers`。

若 `ChartRenderer` 在 kernel 之前创建，调整顺序：先 `createKernel`，再 `new ChartRenderer({ customMarkers$: kernel.marker.readonly.customMarkers, ... })`。

- [ ] **Step 4: Fix tests constructing bare MarkerManager**

```bash
rg "new MarkerManager" packages/core -n
```

每个调用补上 `customMarkers$`（可用空 `createMarkerState().readonly.customMarkers`）。

- [ ] **Step 5: Run Manager + interaction tests**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/marker/__tests__/markerManager.customMarkers.test.ts src/engine/controller/__tests__/interaction.dpr.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit** (only if user asks)

```bash
git add packages/core/src/engine/marker packages/core/src/engine/render/chartRenderer.ts
git commit -m "refactor(core): MarkerManager projects customMarkers from kernel"
```

---

### Task 4: Chart public API writes kernel only

**Files:**
- Modify: `packages/core/src/engine/chart.ts`

- [ ] **Step 1: Retarget update/clear**

```typescript
updateCustomMarkers(markers: CustomMarkerEntity[]): void {
  this.kernel.marker.actions.setCustomMarkers(markers)
  this.renderer.getMarkerManager().clearPositionCache()
  this.scheduleDraw()
}

clearCustomMarkers(): void {
  this.kernel.marker.actions.clearCustomMarkers()
  this.renderer.getMarkerManager().clearPositionCache()
  this.scheduleDraw()
}
```

确认无其它路径直接 `getMarkerManager().setCustomMarkers`：

```bash
rg "setCustomMarkers|registerCustomMarker|clearCustomMarkers" packages/core/src -n
```

Controller / semantic 只应命中 `chart.updateCustomMarkers` / `chart.clearCustomMarkers`。

- [ ] **Step 2: Manual smoke via existing semantic test**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/features/semantic/__tests__/controller.test.ts
```

Expected: pass（仍 mock chart adapter；契约未破）。

- [ ] **Step 3: Commit** (only if user asks)

```bash
git add packages/core/src/engine/chart.ts
git commit -m "refactor(core): route custom markers API through StateKernel"
```

---

### Task 5: Integration verification + PRD checklist

**Files:**
- Optionally update: `.opencode/plans/2026-07-15-statekernel-remaining-PRD.md`

- [ ] **Step 1: Acceptance greps**

```bash
rg "private customMarkers" packages/core/src/engine
rg "setCustomMarkers\(" packages/core/src/engine -n
```

Expected:
- 无 `private customMarkers`
- `setCustomMarkers` 仅出现在 `markerState.actions` 与 `kernel.actions` 转发，不再出现在 `MarkerManager` 写 Map

- [ ] **Step 2: Full core test + build**

```bash
pnpm --filter @363045841yyt/klinechart-core test
pnpm --filter @363045841yyt/klinechart-core build
```

Expected: 全绿（已知 webglRenderer jsdom 环境问题若仍 exclude 则保持 exclude 策略与 CI 一致）。

- [ ] **Step 3: Update PRD Phase 2 status**

在 PRD 验收标准旁注明：

```markdown
## Phase 2 status (2026-07-15)
- [x] customMarkers → markerState
- [x] MarkerManager 无 customMarkers Map
- [x] 帧 runtime（positions / ephemeral markers / hover）留 Manager
- [x] extrema / volumePrice 不进实体 SSOT（settings + 按帧计算）
```

- [ ] **Step 4: Final commit** (only if user asks)

```bash
git add -A
git commit -m "docs: mark StateKernel marker P1 complete"
```

---

## Non-goals (explicit)

1. 不把 `extremaMarkers` / `volumePriceMarkers` 实体列表塞进 kernel  
2. 不把 `customMarkerPositions` 进 kernel（帧 cache）  
3. 不把 `hoveredMarkerId` 从 Manager 迁走（interactionState 已有镜像；本轮不双迁）  
4. 不改 Vue/React 公开 API  
5. 不做渲染双路径合并（那是 PRD「下一个大 PR」性能预研）  
6. 不主动 commit / push / PR，除非用户要求  

---

## Risk register

| Risk | Mitigation |
|------|------------|
| ChartRenderer 创建早于 kernel | 调整 chart 构造顺序：kernel 先于 renderer |
| 测试大量 `new MarkerManager()` | Task 3 Step 4 全量 rg 修复 |
| equal skip 用 JSON.stringify 不稳 | 仅 JSON-like 字段；metadata 已 deepFreeze；测试覆盖 |
| clear 后旧 position 脏命中 | Task 4 `clearPositionCache()` |
| dispose 未清 marker | Task 2 dispose 调用 |

---

## Self-review

**Spec coverage**
- PRD Phase 2 customMarkers SSOT → Tasks 1–4  
- Manager 无 customMarkers Map → Task 3  
- 渲染读标记数据 → getCustomMarkers 读 signal  
- 全绿测试 → Task 5  
- extrema/volumePrice 实体化 → 明确 non-goal（与代码实况一致）

**Placeholder scan:** 无 TBD；步骤含完整代码与命令  

**Type consistency:** `CustomMarkerEntity`、`MarkerStateModule`、`MarkerManagerDeps.customMarkers$` 命名在各 Task 一致  

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-15-marker-state-kernel-P1.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每 Task 新 subagent，Task 间 review  
2. **Inline Execution** — 本会话按 executing-plans 批量推进，带 checkpoint  

Which approach?
