### 4. (Optional) Add AI Agent Control

The chart core exposes its domain capabilities as `@Tool` primitives. Both the UI and the Agent call them through the same path:

```ts
import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/controllers'
```

`getRegisteredChartTools()` returns every tool with its parameter schema, safety level, and unified executor. Hand them to `@363045841yyt/klinechart-agent-runtime`, which orchestrates the Agent inside your app (browser or Electron) against a Provider profile — no MCP bridge, no side-channel state. See [agent-runtime]({{root}}packages/agent-runtime/README.md).
