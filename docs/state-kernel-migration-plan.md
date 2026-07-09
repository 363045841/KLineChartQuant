# StateKernel 迁移计划

## 背景

当前项目采用分散式状态管理，混合了**命令式（plain field）** 与**响应式（Signal）** 两种范式。架构规则依赖人工文档而非类型系统约束，状态流转缺乏单一事实来源（SSOT）。

### 四大致命缺陷

**缺陷 1：状态分散与多重写入路径**
- 同一个逻辑状态（如 `scrollLeft`）被多个 Manager 以 plain field 形式持有并修改。
- 典型例子：`cachedScrollLeft` 有 3 个写入者 — `setScrollLeft()`、DOM `scroll` 回调、`updateObservedMetrics()`。
- 无法判断哪个字段是权威数据源，导致状态不一致、多重写入竞争。

**缺陷 2：派生状态手动同步（缓存即反模式）**
- 大量派生值（`visibleRange`, `viewport`）被存储为可变的 plain field，依赖手动调用 `syncXXX()` 或 `updateXXXSignal()`。
- 典型例子：`updateViewportSignal()` 从 4 个不同位置手动调用。
- 修改源状态后极大概率忘记调用对应 sync 方法，导致下游读取到 stale 数据。

**缺陷 3：隐式时序依赖与控制流滥用**
- 状态推导被拍平成方法调用顺序。例如 `draw()` 内部在写状态（`setKLinePositions` + `updateViewportSignal`），但类型签名上它只是一个渲染函数。
- 类型系统无法表达"必须先调用 X 再调用 Y"的约束，AI 生成代码时随意调换顺序直接引发时序 bug。

**缺陷 4：类型系统未体现读写约束**
- 所有 `Signal<T>` 同时暴露 `.set()` 和读取方法，没有 `ReadonlySignal` 的概念。
- 渲染器和 `draw()` 中持有的 Signal 也可以调用 `.set()`，破坏单向数据流。

---

## 核心原则

> **状态变更必须通过 Actions；派生状态必须自动计算；外部只能读，不能写。**

---

## 架构设计

### ReadonlySignal 类型体系

```typescript
// 只读信号（对外暴露）
type ReadonlySignal<T> = {
  (): T                     // 追踪读取
  peek(): T                 // 非追踪读取
  subscribe(fn: (v: T) => void): () => void
}

// 可写信号（仅内核内部使用）
type Signal<T> = ReadonlySignal<T> & {
  set: (next: T) => void
}

// Computed 保留为别名（向后兼容）
type Computed<T> = ReadonlySignal<T>
```

`Signal<T>.set` 因结构类型而在 Signal 上保留，现有 `Signal<T>` 使用者不受影响。

### StateKernel 组合器

```typescript
class ChartStateKernel {
  private viewport = createViewportState(...)
  private data = createDataState(...)
  private interaction = createInteractionState(...)

  // 仅暴露只读信号和 actions
  readonly signals: {
    viewport: ReadonlySignal<Viewport>
    viewportState: ReadonlySignal<ViewportState>
    interactionSnapshot: ReadonlySignal<InteractionSnapshot>
    data: ReadonlySignal<KLineData[]>
    symbols: ReadonlySignal<SymbolSpec[]>
    // ...
  }

  readonly actions: {
    scrollTo: (v: number) => void
    zoomTo: (level: number) => void
    setSymbols: (specs: SymbolSpec[]) => void
    // ...
  }
}
```

### 数据流

```
外部 Action 调用 (scrollTo, zoomTo, ...)
        ↓
StateKernel 内部 .set()
        ↓
响应式系统自动：
  - 标记 dirty
  - 调度 batch 通知
        ↓
computed 自动重算（基于最新输入）
        ↓
ReadonlySignal 通知外部订阅者
        ↓
Renderer / UI 更新（只读消费）
```

✅ **整个流程无手动同步、无中间态、无权限越界**。

---

## 子状态设计

### Viewport State

**内部可写信号**（`createViewportState` 私有）:

| 信号 | 用途 | 写入者 |
|------|------|--------|
| `scrollLeft` | DOM scrollLeft | action `scrollTo()`, `syncFromDomScroll()` — 仅此两条路径 |
| `viewWidth` / `viewHeight` | 容器尺寸 | ResizeObserver effect |
| `preciseDpr` | 精确 DPR | ResizeObserver effect |
| `zoomLevel` | 缩放级别 | action `zoomTo()` |
| `kWidth` / `kGap` | K 线宽度/间隙 | action `zoomTo()` |

**外部只读信号**（通过 `computed` 自动派生）:

| 信号 | 推导逻辑 |
|------|----------|
| `dpr` | `clampDpr(viewWidth, viewHeight, preciseDpr)` |
| `viewport` | `{ viewWidth, viewHeight, plotWidth, plotHeight, scrollLeft, dpr }` |
| `viewportState` | `{ zoomLevel, plotWidth, plotHeight, dpr, visibleFrom, visibleTo, kWidth, kGap }` |

**Actions**:
- `scrollTo(v)` — 钳制 → 写入 scrollLeft signal → 写入 DOM `container.scrollLeft`
- `syncFromDomScroll()` — 从 `container.scrollLeft` 读取 → 写入 scrollLeft signal（供 scroll 事件回调）
- `zoomTo(level, anchorX?)` — 更新 zoomLevel → kWidth/kGap → 补偿 scrollLeft → scheduleDraw

### Interaction State

**内部可写信号**:

```typescript
// 约 20 个字段从普通变量迁移为可写引用
isDragging: writableRef(false)
dragMode: writableRef<'none'|'pan'|'resize-separator'|'scale-price'|'explore'>('none')
crosshairPos: writableRef<{x,y}|null>(null)
crosshairIndex: writableRef<number|null>(null)
crosshairPrice: writableRef<number|null>(null)
hoveredIndex: writableRef<number|null>(null)
activePaneId: writableRef<string|null>(null)
tooltipPos: writableRef<{x,y}>({x:0,y:0})
kLinePositions: writableRef<number[]>([])
// ...
```

**RAF 批处理写入**:

指针事件处理器**不直接写入 signals**，而是写入普通变量（plain field / transfer slot），仅用于暂存最新值，不参与响应式系统：

```typescript
// transfer slot：事件到 RAF 的传递槽，生命周期仅限于当前帧
// 不缓存、不持久化、不可被任何渲染逻辑读取
private pendingInteraction: InteractionSnapshot = { ...initial }
private flushScheduled = false

onPointerMove(e) {
  this.pendingInteraction.hoveredIndex = ...
  this.pendingInteraction.crosshairPos = ...
  this.scheduleFlush()
}

// RAF 回调一次性写入 signals，通知最多每帧一次
private scheduleFlush() {
  if (this.flushScheduled) return
  this.flushScheduled = true
  requestAnimationFrame(() => {
    batch(() => {
      this.crosshairPos.set(this.pendingInteraction.crosshairPos)
      this.hoveredIndex.set(this.pendingInteraction.hoveredIndex)
      // ... 所有 pending 字段
    })
    this.flushScheduled = false
  })
}
```

**外部只读信号**:
- `interactionSnapshot` — `computed(() => ({ /* 全部字段 */ }))`，替换 `getInteractionSnapshot()` + `notifyInteractionChange()`

### Data State

| 内部可写 | 外部只读 | 推导关系 |
|----------|----------|----------|
| `_dataSignal` | `data` | — |
| `_loadingSignal` | `loading` | — |
| `_symbolsSignal` | `symbols` | — |
| `activeBufferKey` | — | — |
| — | `visibleRange` | `computed(() => getVisibleRange(scrollLeft, plotWidth, kWidth, kGap, dataLength))` |

关键变更：`visibleRange` 不再是手动计算的普通变量，而是从 viewport + dataLength + kWidth/kGap 自动派生的 `computed()`。

---

## 迁移路径

### 阶段 0：基础设施

| 目标 | 交付物 |
|------|--------|
| ReadonlySignal 类型 | `signal.ts` 新增 `ReadonlySignal<T>`，`Signal<T>` 继承之 |
| Computed 返回值类型 | `computed()` 返回 `ReadonlySignal<T>`，保留 `Computed<T>` 别名 |
| createSubState 工厂 | 接受初始状态，返回 `{ signals, actions, readonly }` 结构 |
| StateKernel 组合器 | 骨架代码，连线试验 |

**验收**: `pnpm test:unit` 通过，`pnpm type-check` 通过。

---

### 阶段 1：Viewport 管线

**范围**: `ChartViewportManager` + `ScrollCompensator` + `chart.ts` viewport 相关

**删除项**:
| 字段/方法 | 替代 |
|-----------|------|
| `cachedScrollLeft` | `scrollLeft` 可写引用，唯一写入者：`scrollTo()` action |
| `observedSize` | `viewWidth` / `viewHeight` 可写引用 |
| `preciseDpr` | `preciseDpr` 可写引用 |
| `_internalViewport` | **已消除** — `viewport` 变为 `computed()` |
| `_viewportSignal` | **已消除** — `viewportState` 变为 `computed()` |
| `updateViewportSignal()` | **已删除** — computed 自动派生 |
| `syncScrollLeft()` | **已删除** — action `scrollTo()` 同步写入 signal + DOM |

**副作用分离**:
- `syncCanvasDom()` + `resizeSharedWebGLSurface()` → 订阅 `viewport` signal 的 `effect()`

**消费者更新**:
- `ScrollCompensator.deps.getCachedScrollLeft()` → `kernel.signals.scrollLeft.peek()`
- `chartRenderer.ts:draw()` → **从渲染中移除 batch 状态写入**，改为 `kernel.actions.setKLinePositions()`

**验收**: `git grep "updateViewportSignal"` → 无。`git grep "cachedScrollLeft"` → 无。滚动/缩放行为与阶段 0 一致。

---

### 阶段 2：交互 + 数据输入

#### InteractionController 迁移

- 约 20 个 plain field → `createInteractionState()` 内部的可写引用
- `notifyInteractionChange()` 回调 → `computed(() => getInteractionSnapshot())`
- RAF 批处理（参见上方"RAF 批处理写入"章节）

#### ChartDataManager 迁移

- `_dataSignal`, `_loadingSignal`, `_symbolsSignal`, `_symbolCatalog` → 暴露为 `ReadonlySignal`
- `computeRawVisibleRange()` → `visibleRange` computed（输入来自 viewport, dataLength, kWidth/kGap）

#### 渲染器清理

`chartRenderer.ts:draw()` 变为纯消费者：不写入任何信号。`RendererDependencies` 中的 setters 方法用 actions 替换。

**验收**: TypeScript 阻止在 `draw()` 中调用 `.set()`。十字准线/缩放锚点功能验证通过。

---

### 阶段 3：全状态收敛

迭代每个剩余 Manager：

| Manager | 变更 |
|---------|------|
| `ChartZoomController` | `zoomLevel`/`kWidth`/`kGap` 信号化；`syncKWidthKGap()` 删除 |
| `ChartPaneLayout` | 面板比例信号化；`paneLayout` computed |
| `ChartIndicatorManager` | 解耦 visibleRange 更新（不再手动传递） |
| `MarkerInteractionState` | 合并入 interactionState signals |

**Controller 桥接移除** (`createChartController.ts`):

删除约 15 处 `chart.xxx.subscribe(() => yyy.set(...))` 桥接订阅。Controller 直接暴露 `kernel.signals.*` 作为 `ReadonlySignal<T>`。

**验收**: `git grep -E "private.*(number|boolean|string)\b" packages/core/src/engine/` 应仅剩局部变量，无跨模块状态字段。

---

### 阶段 4：清理加固

- 删除 Controller 桥接层残余
- 所有公共信号类型锁定为 `ReadonlySignal<T>`
- `pnpm type-check` 强制架构合规
- AGENTS.md 更新：删除"Scroll / Coordinate System"和"Signal Atomicity"中的时序规则
- AGENTS.md 新增 "StateKernel Strip" 指引

**验收**:
- 编译器禁止所有架构违规
- 新增功能无需查 AGENTS.md 时序警告
- 近 50 次 commit 中的 `fix(...timing...)` 类问题归零

---

## 过渡策略

- 无 feature flag：每阶段完整重构一个模块，旧代码直接删除而非分支。
- 回滚手段：`git revert`。
- 每阶段结束时 `pnpm test:unit` + `pnpm test:packages` 全绿。
- 每阶段功能验证需覆盖：滚动、缩放、十字线、指标加载、数据切换、分时/K 线模式切换。
