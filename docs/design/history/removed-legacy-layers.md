# 遗留取数与 Agent 桥接层的移除

> 状态：历史决策记录。以下层已删除，仅用于解释旧名称与迁移背景。

## 移除 ai-runtime 与 MCP 桥接层

旧 `@363045841yyt/klinechart-ai-runtime` 及 core 中的 `features/mcp` WebSocket 桥接已删除。

图表不再维护第二份状态副本：Agent 通过 core 原生 `@Tool` 注册表（`getRegisteredChartTools()`）直接调用图表内核，工具入参由 Core 解释，无需 MCP 中间层或 DSL。

后续 Agent 编排统一交给 `@363045841yyt/klinechart-agent-runtime`。相关边界见 `docs/design/agent/agent-chart-context-ssot.md`、`docs/design/agent/agent-market-data-apis.md`。

## 移除旧 Fetcher 兼容层

图表运行时只通过 `MarketDataProvider` 与 `SourceRouter` 取数。旧 `DataFetcher` / registry / router / Legacy Adapter 已删除，避免两套契约并存。

图表与 Agent 现在都通过 `MarketDataCache` 查询结构化领域结果。`DataBuffer` 和 `TimeShareBuffer` 只投影查询结果，不再接受 fetcher、游标页结果或来源迁移回调。自定义数据仍走 `setData` / `applyCustomData`。统一序列所有权见 `docs/design/data/unified-series-repository.md`。

## 移除 legacy Marker 系统

旧 Marker 层（`engine/marker/`、`renderers/customMarkers.ts`、`state/markerState.ts`、`chart/impl/facade/chartMarkerFacade.ts`、`controller/markerInteraction.ts`）已整层删除。它是 StateKernel / Scene 重构之前留下的实现，绘制与命中自成一套，且与 Plot 管线职责重叠。

- 自定义标记的绘制、命中与 tooltip 一并移除：`customMarkers` Vue prop、`#marker-tooltip` 插槽、`MarkerTooltip.vue`、`updateCustomMarkers` / `clearCustomMarkers` controller 方法、`MarkerEntity` / `CustomMarkerEntity` 类型导出，以及 core 的 `./engine/marker/registry` 子路径导出全部删除。
- 量价关系标记（`settings.showVolumePriceMarkers`）连绘制一起移除：删除 `foundation/utils/volumePrice.ts`、`foundation/types/volumePrice.ts`、candle Layer 中的三角形几何与登记逻辑、`volumePrice` 颜色 Token（`dtcg/scheme/*.tokens.json` 及其生成物）与该设置项。
- `InteractionSnapshot` 不再含 `hoveredMarkerData` / `hoveredCustomMarker`；悬停命中链路收敛为 边界 → pane 分隔器 → K 线 bar → 十字线定位 → candle → tooltip。
- 形状类绘图不再由 Marker 承担：Pine 语义的 `plotshape` 由通用 Plot 管线原生实现（契约在 `packages/plot-contracts`，投影与绘制在 `engine/plots/`），不使用 Marker 的旧路径。
