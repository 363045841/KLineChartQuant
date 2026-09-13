# 移除 ai-runtime 与 MCP 桥接层

旧 `@363045841yyt/klinechart-ai-runtime` 及 core 中的 `features/mcp` WebSocket 桥接已删除。

图表不再维护第二份状态副本：Agent 通过 core 原生 `@Tool` 注册表（`getRegisteredChartTools()`）直接调用图表内核，工具入参由 Core 解释，无需 MCP 中间层或 DSL。

后续 Agent 编排统一交给 `@363045841yyt/klinechart-agent-runtime`。
