# Facade State 重构计划

## 背景

当前 `Chart` 类中有一个历史遗留的 `createStateStore`，用于向 Vue/React/Angular
框架层暴露 UI 状态。这个 store 不是 kernel 子状态模块，需要手动 bridge 同步。

### 当前状态

```typescript
private state = createStateStore({
  theme: 'light',          // 仅 setTheme() 写入
  drawingTool: null,       // 仅 setDrawingTool() 写入
  drawings: [],            // 通过绘制回调更新
  paneRatios: {},          // 通过 onLayoutChange 回调写入
  paneLayout: [],          // 通过 onLayoutChange 回调写入
  interaction: { ... },    // 通过 effect → interactionSnapshot() 桥接
})
```

### 问题

1. **非 kernel 模块** — `createStateStore` 无 `computed`、无自动派生、无 actions
2. **手动桥接** — `interaction` 通过 `effect` 手动同步，违背自动推导原则
3. **零散写入** — `paneRatios`/`paneLayout` 通过 `onLayoutChange` 回调写入，
   `theme` 通过 `setTheme()` 写入，写入路径不统一
4. **信号类型** — 对外暴露的是 `Signal<T>`（可写），应为 `ReadonlySignal<T>`

## 迁移目标

| 当前字段 | 目标子状态 | 迁移方式 |
|----------|-----------|---------|
| `theme` | `themeState.ts` | 新建模块，`setTheme()` 改为 `themeState.actions.setTheme()` |
| `drawingTool` | `drawingState.ts` | 新建模块，合并 drawingTool + drawings 信号 |
| `drawings` | `drawingState.ts` | 同上 |
| `paneRatios` | `paneState.ts`（已有） | 已完成 Step 4 注入，只需改为从此读取 |
| `paneLayout` | `paneState.ts`（已有） | 同上 |
| `interaction` | `interactionState.ts`（已有） | 直接暴露 `interactionState.readonly.interactionSnapshot`，删除桥接 effect |

## Step-by-step

### Step 1: themeState

**新建** `packages/core/src/engine/state/themeState.ts`

```typescript
createThemeState() → { readonly: { theme }, actions: { setTheme }, dispose }
```

**修改** `chart.ts`:
- 创建 `_themeState = createThemeState()`
- `setTheme(theme)` → `this._themeState.actions.setTheme(theme)` + `scheduleDraw()`
- getter `get theme(): ReadonlySignal<'light' | 'dark'>` → `this._themeState.readonly.theme`

### Step 2: drawingState

**新建** `packages/core/src/engine/state/drawingState.ts`

```typescript
createDrawingState() → {
  readonly: { drawingTool, drawings },
  actions: { setDrawingTool, setDrawings, clearDrawings },
  dispose,
}
```

**修改** `chart.ts`:
- 创建 `_drawingState = createDrawingState()`
- `setDrawingTool(tool)` → `this._drawingState.actions.setDrawingTool(tool)`
- 绘制回调中的 `state.set.drawings(...)` → `this._drawingState.actions.setDrawings(...)`

### Step 3: 更新 paneState 读取

**修改** `chart.ts`:
- `get paneRatios()` → `this._paneState.readonly.paneRatios`
- `get paneLayout()` → `this._paneState.readonly.paneSpecs`
- 删除 `onLayoutChange` 回调中的 `this.state.set.paneRatios(...)` 和 `this.state.set.paneLayout(...)`

### Step 4: interaction 桥接删除

**修改** `chart.ts`:
- 删除 `effect(() => { this.state.set.interaction(interactionSnapshot()) })`
- `get interactionState()` → 直接返回 `this._interactionState.readonly.interactionSnapshot`
- 或保持现有 getter 签名，改为委托 `_interactionState`

### Step 5: 删除 createStateStore

**修改** `chart.ts`:
- 删除 `private state = createStateStore({...})`
- 如有必要，重建一个组合的 `chartSnapshot` computed 供框架层统一消费

## 框架层适配

Vue/React/Angular 通过 `subscribe()` 或 `computed(() => ...)` 消费这些信号。
迁移后各信号类型从 `Signal<T>` 变为 `ReadonlySignal<T>`，对框架层的影响：

| 框架 | 当前消费方式 | 迁移后 |
|------|-------------|--------|
| Vue | `chart.data.subscribe(() => ...)` | 不变（`ReadonlySignal.subscribe` 仍可用） |
| React | `useSyncExternalStore(store.subscribe, store.snapshot)` | 不变 |
| Angular | `toSignal` | 不变 |

只需确保 `ReadonlySignal` 有 `subscribe` 方法（已有）。

## 验收条件

- `git grep "createStateStore" packages/core/src/engine/` → 无
- `git grep "this.state.set." packages/core/src/engine/chart.ts` → 无
- 所有信号类型从 `Signal<T>` 变为 `ReadonlySignal<T>`
- `pnpm test:unit` + `pnpm test:packages` 全绿