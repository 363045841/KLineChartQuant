### 4.（可选）启用 AI Agent 控制

图表核心以 `@Tool` 原语对外暴露领域能力，UI 与 Agent 通过同一条路径调用：

```ts
import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/controllers'
```

`getRegisteredChartTools()` 返回每个工具的参数 schema、safety 等级与统一执行器。将它们交给 `@363045841yyt/klinechart-agent-runtime`，即可在应用内（浏览器或 Electron）基于 Provider profile 编排 Agent——无 MCP 桥接，无旁路状态副本。详见 [agent-runtime]({{root}}packages/agent-runtime/README.md)。
