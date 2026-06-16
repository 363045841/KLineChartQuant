# @363045841yyt/klinechart-ai-runtime

MCP (Model Context Protocol) server and AI tool schemas for
[@363045841yyt/klinechart-core](https://github.com/363045841/KLineChartQuant/tree/main/packages/core)
([npm](https://www.npmjs.com/package/@363045841yyt/klinechart-core))
/
[@363045841yyt/klinechart](https://github.com/363045841/KLineChartQuant/tree/main/packages/vue)
([npm](https://www.npmjs.com/package/@363045841yyt/klinechart)).

Optional addon — install only if you need AI agent / MCP control of your charts.

Provides a WebSocket-bridged MCP server that enables AI agents (via MCP Inspector
or any MCP client) to control K-line chart operations — zoom, pan, add/remove
indicators, change theme, and more.

## Installation

```bash
pnpm add @363045841yyt/klinechart-ai-runtime
```

Requires `@363045841yyt/klinechart-core` as a peer dependency.

## Quick Start

### Start the MCP server

```ts
import { createMcpServer } from '@363045841yyt/klinechart-ai-runtime/mcp-server'

const { start, stop } = createMcpServer({
  ws: { port: 8080 },
})

await start()
```

### Integrate with KLineChart (Vue example)

```vue
<script setup lang="ts">
import KLineChart from '@363045841yyt/klinechart'
import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

const mcpConfig = {
  wsUrl: 'ws://localhost:8080',
  autoReconnect: true,
  onToolCall: (call) => {
    const ctrl = chartRef.value?.getController?.()
    if (!ctrl) return { success: false, error: 'Controller not ready' }
    return executeTool(ctrl, call)
  },
}
</script>

<template>
  <KLineChart ref="chartRef" :mcp="mcpConfig" />
</template>
```

### Connect from MCP Inspector

```bash
cd packages/ai-runtime
pnpm inspect
```

Then call tools like `chart.zoomToLevel` with `{ "level": 5 }`.

## Exports

### Main entry (`@363045841yyt/klinechart-ai-runtime`)

| Export | Description |
|--------|-------------|
| `executeTool` | Dispatch a tool call to a chart controller |
| `ALL_TOOLS` | Array of all supported tool schemas |
| `TOOL_GROUPS` | Grouped tool definitions |
| `findTool(name)` | Look up a tool schema by name |
| `describeVolumeProfileState` | Generate VP state summary |
| `describeAnchoredVwap` | Generate anchored VWAP summary |
| `describeFootprintLatestBar` | Generate footprint summary |
| `describeAlerts` | Generate alerts summary |
| `serialize` / `deserialize` | Chart state serialization |
| `SessionRegistry` | WebSocket session manager |

### MCP Server (`@363045841yyt/klinechart-ai-runtime/mcp-server`)

| Export | Description |
|--------|-------------|
| `createMcpServer(options)` | Create MCP + WebSocket server instance |

### Create with MCP (`@363045841yyt/klinechart-ai-runtime/create-with-mcp`)

Legacy helper — prefer `executeTool` + `mcp` prop pattern above.

## Architecture

```
┌─────────────────┐        WebSocket          ┌───────────────────┐
│   Browser       │◄─────────────────────────►│  MCP Server       │
│                 │   register / tool:call    │  (Node.js)        │
│  KLineChart     │   tool:result /           │                   │
│  └─ ChartBridge │   state:update            │ ┌─ SessionRegistry│
│       ↓         │                           │ └─ WsSessionHandle│
│  └─ onToolCall ─┼───────────────────────────┼──► executeTool    │
└─────────────────┘                           └────────┬──────────┘
                                                       │ stdio
                                                       ▼
                                               ┌────────────────────┐
                                               │  MCP Client        │
                                               │  (Inspector / AI)  │
                                               └────────────────────┘
```

## Available Tools

| Tool | Description |
|------|-------------|
| `chart.zoomToLevel` | Zoom to a specific level |
| `chart.setTheme` | Switch between light/dark theme |
| `indicators.add` | Add an indicator by definition ID |
| `indicators.remove` | Remove an indicator by instance ID |
| `indicators.updateParams` | Update indicator parameters |

## License

MIT
