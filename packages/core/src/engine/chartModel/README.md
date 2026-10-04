# ChartModel 模块

图表数据视图模型的唯一事实来源。回答：当前处于哪个数据视图、该视图意味着什么、主品种周期应切换到哪个视图、该视图上叠加了什么，并提供各视图的行为实现。

## 结构

`chartModel/` 只有一个实现目录 `impl/`，其下用三个子目录区分职责：

- `impl/view/`：视图的**声明与状态**。
  - `chartViews.ts`：`CHART_VIEW_DEFINITIONS` 声明每个视图（kline / timeshare / fiveDayTimeShare）的主序列渲染偏好、`requiresMarketSession`、横向 `capabilities` 与主图系统实例；`resolveChartDataView(period)` 是从主品种周期到数据视图的唯一推导；re-export `ChartDataViewId` / `ChartDataView` / `isTimeShareDataView` / `resolveChartWorkspaceId` / `ChartWorkspaceId`，类型只从本模块流出。
  - `chartModelState.ts`：`createChartModel()` 保存 `dataView` / `lastBarPeriod` / `primaryRendererByView`，派生 `effectivePrimaryRenderer` 与 `interactionCapabilities`。
- `impl/modes/`：视图的**行为实现**。
  - `types.ts`：`ChartModeHandler` 契约（`updatePaneRange` / `onActivate` / `onDeactivate` / `useIndicatorScheduler`）。
  - `kLineMode.ts` / `timeShareMode.ts`：各视图逐帧价格范围计算；分时实现持有运行时 `marketSession`。
  - `timeShareMath.ts` / `fiveDayTimeShareGeometry.ts`：分时数学与几何。
- `impl/comparison/`：视图上的**比较叠加**。
  - `types.ts`：`ComparisonProjection` / `ComparisonData` / `ComparisonSeriesProjection` 一帧投影契约。
  - `comparisonProjection.ts`：`projectComparison()` 把主品种 OHLC 与比较序列归一到共同基点的纯投影。
  - `comparisonState.ts`：`createComparisonState()` 保存比较品种 `specs` / `colors` / `hidden` / `loading`。

三者是同一「图表数据视图模型」的组成部分：`view/` 说这是什么视图，`modes/` 说这个视图怎么算怎么画，`comparison/` 说这个视图上叠了什么、怎么投影。

- `index.ts`：模块唯一出口，转发三个子目录的公开面。
- `__tests__/`：模块级状态测试。

## 依赖方向

`Chart` 从 `chartModel` 读取视图声明与状态，并据此激活对应 `ChartModeHandler`。`viewStrategies`（横向几何策略）、`viewportState`、`chartZoomController`、`chartStateKernel`、指标定义与渲染器都从本模块读取视图能力与分类，不再各自散落判断视图。新增视图时只需在 `CHART_VIEW_DEFINITIONS` 补齐一份声明并实现一个 `ChartModeHandler`，横向能力和系统实例自动派生。

## 边界

ChartModel 承载「视图是谁、怎么画、叠了什么」三类纯视图计算与状态，不碰行情拉取与存储。

- **属于本模块**：视图声明与状态、逐帧价格范围计算、比较折线投影与其选择状态。
- **不属于本模块**：比较品种的**数据协调**（订阅 Buffer、触发行情分页，见 `engine/data/comparisonManager.ts`）与**CRUD 命令**（`engine/data/comparisonCommands.ts`）——它们依赖 `SeriesRepository` / `MarketDataCache`，属于「数据从哪来」的职责。
- 视图切换的渲染副作用（清屏、图例清理、模式处理器激活）仍编排在 `Chart`，本模块不产生除 `ChartModeHandler` 回调之外的副作用。
