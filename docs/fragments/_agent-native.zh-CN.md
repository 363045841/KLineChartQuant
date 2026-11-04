## 🤖 Agent 原生架构

KLineChartQuant 把图表能力以 `@Tool` 原语暴露在图表核心上。Agent 与 UI 调用同一批入口：一份状态、一条执行链路，没有桥接层，也没有旁路状态。

- **同一套原语** — UI 操作与 Agent 工具共用 `ChartController`；工具是 Action 的子集。
- **唯一真源** — 图表状态由 `StateKernel` 持有，外部只读 readonly signal。
- **无 MCP 桥接** — 工具直接注册在核心上，一次调用即进内核，不需要 DSL 或状态副本。
