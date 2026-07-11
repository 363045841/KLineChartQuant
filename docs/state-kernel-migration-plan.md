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

**分类原则**：

| 分类 | 说明 | 迁移策略 |
|------|------|----------|
| 外部可观测状态 | 渲染器/UI 需读取的字段 | → writableRef（source signal）|
| 内部瞬态 | 仅事件处理内部使用，不参与渲染 | → 保持 plain field |
| 帧数据 | 由 renderer draw() 计算后推入 | → writableRef，action 写入，注释标注 renderer 为唯一写入者 |

**Source signals（action 写入）**:

```typescript
// 外部可观测状态
crosshairPos: writableRef<{x,y}|null>(null)
crosshairPrice: writableRef<number|null>(null)
hoveredIndex: writableRef<number|null>(null)
activePaneId: writableRef<string|null>(null)
isDragging: writableRef(false)
dragMode: writableRef<'none'|'pan'|'resize-separator'|'scale-price'|'explore'>('none')
hoveredSeparatorUpperPaneId: writableRef<string|null>(null)
hoveredRightAxisPaneId: writableRef<string|null>(null)
tooltipPos: writableRef<{x,y}>({x:0,y:0})
tooltipAnchorPlacement: writableRef<'right-bottom'|'left-bottom'>('right-bottom')
// 帧数据（renderer 为唯一写入者，通过 updateFramePositions action）
kLinePositions: writableRef<number[]|null>(null)
kLineCenters: writableRef<number[]|null>(null)
kWidthPx: writableRef<number|null>(null)
```

**不迁移为 signal 的字段（保持 plain field）**:

```typescript
// 仅事件处理内部使用，不参与渲染/快照
dragStartX / dragStartY / scrollStartX
touchStartTime / touchStartX / touchStartY
isTouchSession / exploreMode
activePaneIdOnDrag / activeSeparatorUpperPaneId
lastClientPos / lastHoverRenderKey
```

**注意**：`visibleRange` **不在** interactionState 中 — 通过 `InteractionDeps.visibleRange$` 从 viewportState 读取，避免双重 SSOT。

**InteractionDeps**（与 ViewportDeps 模式一致）:

```typescript
interface InteractionDeps {
  /** viewportState 的 visibleRange computed — 只读消费，不写入 */
  visibleRange$: ReadonlySignal<{ start: number; end: number } | null>
  /** scrollLeft logical — 用于 crosshairIndex 的 worldX 计算 */
  scrollLeftLogical$: ReadonlySignal<number>
  /** scheduleDraw — 仅在 action 中调用，不进入 computed */
  scheduleDraw: (level?: UpdateLevel) => void
}
```

**Computed**:

```typescript
crosshairIndex: (s) => {
  // 读 s.crosshairPos + s.kLinePositions + s.kWidthPx + deps.visibleRange$()
  // inline 展开，不引用其他 computed（createSubState 不支持 computed 链式依赖）
  const pos = s.crosshairPos()
  if (!pos || !s.kLinePositions() || !s.kWidthPx()) return null
  const vr = deps.visibleRange$()
  if (!vr) return null
  // ... 二分查找逻辑
}
interactionSnapshot: (s) => ({
  crosshairPos: s.crosshairPos(),
  crosshairIndex: s.crosshairIndex(),
  // ... 全部字段
})
```

**RAF 批处理写入**:

RAF 是 **action 层**的模式（控制何时写入），不影响 state 层定义。指针事件处理器不直接写入 signals，而是写入 transfer slot（plain object），仅暂存最新值：

```typescript
// transfer slot：事件到 RAF 的传递槽，生命周期仅限于当前帧
private pendingInteraction: InteractionSnapshot = { ...initial }
private flushScheduled = false

onPointerMove(e) {
  this.pendingInteraction.crosshairPos = ...
  this.pendingInteraction.hoveredIndex = ...
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
- `crosshairIndex` — computed，自动从 crosshairPos + kLinePositions + visibleRange$ 推导，替代 getter
- `interactionSnapshot` — computed，替换 `getInteractionSnapshot()` + `notifyInteractionChange()`

### Data State

| 内部可写 | 外部只读 | 推导关系 |
|----------|----------|----------|
| `_dataSignal` | `data` | — |
| `_loadingSignal` | `loading` | — |
| `_symbolsSignal` | `symbols` | — |
| `activeBufferKey` | — | — |
| — | `visibleRange` | `computed(() => getVisibleRange(...))` — 输入来自 viewportState deps（scrollLeft$, plotWidth$, kWidth$ 等），不独立持有 scrollLeft / kWidth |

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

- 约 20 个 plain field 按分类迁移：外部可观测状态 → writableRef；内部瞬态 → 保持 plain field；帧数据 → writableRef（renderer 通过 `updateFramePositions` action 写入）
- `visibleRange` **不在** interactionState 中 — 通过 `InteractionDeps.visibleRange$` 从 viewportState 读取
- `notifyInteractionChange()` 回调 → `computed(() => getInteractionSnapshot())`
- RAF 批处理（参见上方"RAF 批处理写入"章节）

#### ChartDataManager 迁移

- `_dataSignal`, `_loadingSignal`, `_symbolsSignal`, `_symbolCatalog` → 暴露为 `ReadonlySignal`
- `computeRawVisibleRange()` → `visibleRange` computed（输入来自 viewport, dataLength, kWidth/kGap）

#### 渲染器清理

`chartRenderer.ts:draw()` 变为纯消费者：不写入任何信号。`RendererDependencies` 中的 setters 方法用 actions 替换。

**架构合规检查**:
- `visibleRange` 在 interactionState 中无 writable signal — 仅通过 deps 从 viewportState 读取
- `kLinePositions`/`kLineCenters`/`kWidthPx` 为 source (writable) signals，注释标注 renderer 为唯一写入者
- `crosshairIndex` 为 computed，不引用其他 computed（inline 展开推导逻辑）

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

### 阶段 4：清理加固 ✅

- ~~删除 Controller 桥接层残余~~ → 此前阶段已完成
- 所有子状态模块 return 中移除 `signals`（WritableSignal bag） — 仅 interactionState 需先行新增 `setHoveredIndex`/`setActivePaneId` action 供 interaction.ts 使用
- `interaction.ts` 中 6 处直接 `.signals` 写入 → 改为 `.actions` 调用
- `interaction.dpr.test.ts` mock 同步更新（去除 `signals` return + 补齐 actions）
- `AGENTS.md` line 89 更新描述，明确 `signals` 不属公共 API

**验收**:
- `pnpm -r test` 全绿（1685 tests pass, 6 pre-existing WebGL failures unrelated）
- `git grep '\.signals\.' packages/core/src/engine/` → 零返回（生产代码无直接 `.signals` 访问）

---

### 阶段 5：StateKernel 组合根 ✅

**目标**：创建 `ChartStateKernel extends StateKernel` 具体类，将所有子状态创建+交叉连接从 `Chart` 构造函数移到 kernel，简化 `createChartController.ts` 中的重复信号包装器。

**变更**:
1. 创建 `engine/state/chartStateKernel.ts` — 组合 zoom、data、pane、theme、drawing、interaction 六个子状态，暴露 `zoomLevel$`/`dataLength$`/`optionsForViewport$` 桥接信号供 ChartViewportManager 使用。
2. ChartStateKernel 还暴露 `signals`（扁平 ReadonlySignal bag）和 `actions`（扁平 action bag）供 framework adapter 直接消费。
3. `Chart` 构造函数 — 删除 ~80 行的手动子状态创建+交叉连接 effect，替换为 `new ChartStateKernel(deps)`。kernel 内部处理 dpr placeholder → viewport dpr 桥接、dataLength 自动同步。
4. `createChartController.ts` — 7 个重复 `computed()` 包装器（`themeSignal`、`drawingTool`、`drawings`、`paneRatios`、`paneLayout`、`interactionState`、`symbolCatalog`）替换为直接引用 `chart.kernel.xxx.readonly.yyy`。
5. 清理 — 删除废弃的 `mapPaneRatios`、`mapInteractionRecord`、`mapInteractionSnapshot` 函数。
6. 修复遗留的 `getKWidthKGap` 预存 TS 错误（从 `chart.getOption()` → `chart.kernel.zoom.readonly.kWidth/kGap.peek()`）。

**验收**:
- `pnpm build`（core）通过，零 TS 错误
- `pnpm test`（core）通过 — 1679 pass, 6 pre-existing WebGL failures
- `ChartStateKernel extends StateKernel` — 具体 kernel 类存在且被 Chart 使用
- `git grep 'extends StateKernel'` → `packages/core/src/engine/state/chartStateKernel.ts`

---

## 过渡策略

- 无 feature flag：每阶段完整重构一个模块，旧代码直接删除而非分支。
- 回滚手段：`git revert`。
- 每阶段结束时 `pnpm test:unit` + `pnpm test:packages` 全绿。
- 每阶段功能验证需覆盖：滚动、缩放、十字线、指标加载、数据切换、分时/K 线模式切换。
