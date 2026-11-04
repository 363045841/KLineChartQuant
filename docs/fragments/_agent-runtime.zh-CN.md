### 4.（可选）启用 AI Agent 控制

`KlineWorkbench` 自带 Agent 面板。图表核心以 `@Tool` 原语对外暴露领域能力，Agent 与 UI 调用同一批
原语：同一份状态、同一条执行路径，无 MCP 桥接，无旁路状态副本。高级 Agent API 位于同一个包的
`@363045841yyt/klinechart/agent` 子入口。
