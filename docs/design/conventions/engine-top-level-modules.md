# engine 顶层模块收敛：chart 与 pane

## 背景

`packages/core/src/engine/` 根目录此前散落 7 个一级文件，承担的是两个互不相同的职责域，却与 `chartModel/`、`state/`、`layout/` 等既有模块平级堆放：

| 文件 | 职责 |
|------|------|
| `chart.ts` | `Chart` 组合根：装配 StateKernel / Viewport / Pane / Renderer / Facade / Interaction |
| `chartContext.ts` | `ChartEventBus` + `ChartEventMap` |
| `chartTypes.ts` | 图表与 pane 的混合契约（`ChartDom` / `ChartOptions` / `Viewport` / `PaneSpec` / `PaneRendererDom` / `IndicatorInstance` / `SubPaneInfo` …） |
| `paneIds.ts` | `MAIN_PANE_ID` 常量 |
| `paneManager.ts` | pane 领域写原语（`PaneManager`） |
| `paneRenderer.ts` | 单 pane 的 canvas / context 持有者（`PaneRenderer`） |
| `subPaneManager.ts` | 副图指标 renderer 投影 reconcile（`SubPaneManager`） |

按 AGENTS.md「Semantic module layout」约定，散落的实现应归入语义模块，契约定于 `types.ts`，出口唯一为 `index.ts`。本次将这批文件拆成两个模块：`chart/`（图表装配层）与 `pane/`（pane 领域），并删除死代码。

## 目标结构

```
engine/
├── chart/                     # 图表装配层
│   ├── types.ts               # ChartDom / ChartOptions / Viewport / ViewportState / KLinePositions / IndicatorRole / IndicatorInstance / SubPaneInfo
│   ├── index.ts               # barrel：Chart + InteractionSnapshot + 上述类型
│   └── impl/
│       └── chart.ts           # 原 engine/chart.ts
├── pane/                      # pane 领域
│   ├── types.ts               # PaneSpec / PaneRendererDom / PaneRendererContexts / PaneRendererOptions / PanePatch / CreatePaneInput / PaneManagerDependencies / SubPaneResources / SubPaneEntry / SubPaneContext / MAIN_PANE_ID / PANE_HEADER_INSET_PX
│   ├── index.ts               # barrel：PaneManager / PaneRenderer / SubPaneManager / hasSubPaneRendererMetadata + 类型
│   └── impl/
│       ├── paneManager.ts     # 原 engine/paneManager.ts
│       ├── paneRenderer.ts    # 原 engine/paneRenderer.ts
│       └── subPaneManager.ts  # 原 engine/subPaneManager.ts
└── …（chartModel / state / layout / frame / … 不变）
```

## 关键决策

### 1. `chartTypes.ts` 按职责一分为二

原 `chartTypes.ts` 是同名混合体，契约按归属拆开：

- **图表级** → `chart/types.ts`：`ChartDom` / `ChartOptions` / `Viewport` / `ViewportState` / `KLinePositions` / `IndicatorRole` / `IndicatorInstance` / `SubPaneInfo`。
- **pane 级** → `pane/types.ts`：`PaneSpec` / `PaneRendererDom` / `PANE_HEADER_INSET_PX` 等。

`IndicatorInstance` / `SubPaneInfo` 属于「图表对外状态」而非 pane 布局，故归 `chart/`。

### 2. `paneIds.ts` 并入 `pane/types.ts`

`MAIN_PANE_ID` 是 pane 词汇表的单一常量，直接置于 `pane/types.ts`（常量与类型同源），不再保留独立文件。

### 3. 删除 `chartContext.ts`

`ChartEventBus` / `ChartEventMap` 全仓无任何消费者（`rg` 确认，仅 agent-runtime 中同名局部变量 `chartContext` 无关）。属死代码，直接删除，而非搬进新模块。

### 4. 依赖契约优先，打断 pane ↔ state 运行时环

`state/*` 只消费 pane 的**类型与常量**，若从 `pane/index.ts`（barrel）导入，会把 `pane/impl/*` 一并拉入，形成 `state → pane(impl) → state` 的运行时环。约定要求「调用方优先依赖契约」，因此仅需类型/常量的调用点一律 import `pane/types.js`，需要实现的调用点才 import `pane/index.js`：

| 调用方 | 依赖 | 导入路径 |
|--------|------|----------|
| `state/paneState.ts`、`state/viewWorkspace.ts` | `PaneSpec` | `pane/types.js` |
| `state/mainPriceAxisState.ts`、`layout/pane.ts`、三处 renderer | `MAIN_PANE_ID` | `pane/types.js` |
| `state/chartStateKernel.ts` | `PaneSpec` + `PaneManager` | `types.js` + `index.js` |
| `indicators/chartIndicatorManager.ts` | `SubPaneContext/SubPaneEntry` + `SubPaneManager` | `types.js` + `index.js` |
| `controllers/*`、`features/agent/*` | 常量/类型 | `pane/types.js` |

`pane/impl/*` 对 state 的引用均为 `import type`（编译期擦除），barrel 因此不再对 state 产生运行时边，环被打断。

### 5. 公开子路径 `engine/chart` 的破坏性变更

`package.json` 的 `./engine/chart` 子路径原先指向 `dist/engine/chart.js`，现指向 `dist/engine/chart/index.js`。按用户要求允许破坏公开 API；此改动使该子路径的解析目标变化，发版应记为破坏性变更。全仓无其他包直接消费该子路径。

## 边界

- 纯结构搬移 + 契约归位 + 死代码删除，不改任何运行时行为、函数签名或公共导出名（`Chart` / `PaneManager` / `PaneRenderer` / `SubPaneManager` / `PaneSpec` 等名称不变）。
- 外部消费者改从 `chart/index.js` / `pane/index.js` 依赖；仅类型/常量消费者下沉到 `types.js`。

## 影响与验证

- `pnpm type-check`：通过。
- core 测试：252 files / 2774 tests 全通过。
- `pnpm test:packages`：core / vue / angular / agent-runtime / react / desktop-electron 全绿。
- Biome：仅剩仓库既有告警（`noConsole` / `noExplicitAny`），本次未新增。
- 文档同步：`docs/architecture/architecture.md`、`docs/rendering/rendering-pipeline.md` 的路径引用更新。
