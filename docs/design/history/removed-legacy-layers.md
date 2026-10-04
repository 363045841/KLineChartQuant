# 遗留取数与 Agent 桥接层的移除

> 状态：历史决策记录。以下层已删除，仅用于解释旧名称与迁移背景。

## 移除 ai-runtime 与 MCP 桥接层

旧 `@363045841yyt/klinechart-ai-runtime` 及 core 中的 `features/mcp` WebSocket 桥接已删除。

图表不再维护第二份状态副本：Agent 通过 core 原生 `@Tool` 注册表（`getRegisteredChartTools()`）直接调用图表内核，工具入参由 Core 解释，无需 MCP 中间层或 DSL。

后续 Agent 编排统一交给 `@363045841yyt/klinechart-agent-runtime`。相关边界见 `docs/design/agent/agent-chart-context-ssot.md`、`docs/design/agent/agent-market-data-apis.md`。

## 移除旧 Fetcher 兼容层

图表运行时只通过 `MarketDataProvider` 与 `SourceRouter` 取数。旧 `DataFetcher` / registry / router / Legacy Adapter 已删除，避免两套契约并存。

图表与 Agent 现在都通过 `MarketDataCache` 查询结构化领域结果。`DataBuffer` 和 `TimeShareBuffer` 只投影查询结果，不再接受 fetcher、游标页结果或来源迁移回调。自定义数据仍走 `setData` / `applyCustomData`。统一序列所有权见 `docs/design/data/unified-series-repository.md`。
