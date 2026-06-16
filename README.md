High-performance financial chart library with a single-frame generation time of just 2ms, stable scrolling at 190–200fps in a 200Hz environment, native support for AI Agent control, full-link ResizeObserver-driven crisp rendering, and a pluggable architecture.
<div align="center">

English | [简体中文](README_CN.md)

# 📈 KLineChartQuant

**Crisp Rendering · High Performance · Optimized Interaction**

[![npm version](https://img.shields.io/npm/v/@363045841yyt/klinechart.svg?style=flat&color=blue)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![npm downloads](https://img.shields.io/npm/dm/@363045841yyt/klinechart.svg?style=flat&color=green)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![license](https://img.shields.io/npm/l/@363045841yyt/klinechart.svg?style=flat&color=orange)](https://github.com/363045841/klinechart/blob/main/LICENSE) [![demo](https://img.shields.io/badge/Demo-Online-purple?style=flat)](https://363045841.github.io/KLineChartQuant/)

[![qq](https://img.shields.io/badge/QQ-672011965-blue?style=flat)](https://qm.qq.com/q/672011965) [![tg](https://img.shields.io/badge/Telegram-Join-26A5E4?style=flat&logo=telegram)](https://t.me/+1o-6B-wVRTU2MjQ9)

</div>

---

A lightweight financial K-line charting library focused on quantitative trading scenarios. **Agent is a first-class citizen** — supports AI Agent direct control of chart operations, providing TradingView-level interaction experience.

<div align="center">
  <img src="https://files.seeusercontent.com/2026/06/14/4Oky/pasted-image-1781448962268.webp" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/06/14/7xPd/pasted-image-1781448960220.webp" width="400" style="border-radius: 12px; margin: 8px;" />
  <br/>
  <img src="https://files.seeusercontent.com/2026/06/05/Udw3/white1.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/06/05/vQg8/white2.png" width="400" style="border-radius: 12px; margin: 8px;" />
</div>

## ✨ Core Features

- **Agent First / MCP Native** - Supports AI Agent direct control of charts via the [Model Context Protocol](https://modelcontextprotocol.io). Built-in WebSocket-bridged MCP server enables any MCP client (Inspector, Claude Desktop, Cursor, etc.) to zoom, pan, add/remove indicators, and change theme in real time
- **Crisp Rendering** - Full-chain ResizeObserver driven, physical pixel alignment, K-lines, wicks, and lines are sharp and clear on all DPR screens
- **Plugin Architecture** - Renderer plugin-based design, supporting dynamic registration, configuration, and lifecycle management
- **Custom Markers** - Supports semantic configuration of custom markers and custom information
- **High Performance** - Smoothly handles tens of thousands of data points, no lag during zoom or pan; supports **190-200fps on 200Hz displays** with single-frame generation time as low as **2ms**
- **WebGL Rendering** - K-lines, volume bars, and MACD bars rendered via WebGL for GPU-accelerated performance, reaching **190fps on 200Hz displays** with per-frame GPU time under **1ms**
- **Optimized Interaction** - Stable zoom anchor, precise crosshair cursor, smooth drag
- **Multi-Symbol Comparison** - Supports unlimited number of instruments for trend comparison
- **Multi-Source Aggregation** - Supports aggregation and unification of multiple data sources

## 🚀 Quick Start

### Prerequisites

KLineChart requires a stock data backend. Please ensure `kmap` and `stockbao` are in the same directory:

```
workspace/
├── KLineChartQuant/ # This repository
└── stockbao/    # Data backend repository
```

### 1. Clone Repositories

```bash
git clone https://github.com/363045841/KLineChartQuant.git
git clone https://github.com/363045841/stockbao.git
```

### 2. Start Data Backend

```bash
cd KLineChartQuant
npm run stockbao
```

After startup, the API is available at `http://localhost:8000`

### 3. Install and Use

```bash
npm install @363045841yyt/klinechart
```

```vue
<script setup lang="ts">
import KLineChart from '@363045841yyt/klinechart';
import type { SemanticChartConfig } from '@363045841yyt/klinechart';

const config: SemanticChartConfig = {
  version: '1.0.0',
  data: {
    source: 'baostock',
    code: 'sh.000001',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    frequency: 'day'
  },
  indicators: {
    main: [{ type: 'MA', params: [5, 10, 20] }],
    sub: [{ type: 'MACD' }]
  }
};
</script>

<template>
  <KLineChart
    :semanticConfig="config"
    :yPaddingPx="24"
  />
</template>
```

### 4. (Optional) Enable MCP / AI Agent Control

```bash
npm install @363045841yyt/klinechart-ai-runtime
```

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

Then start the MCP server:

```bash
cd packages/ai-runtime
pnpm inspect
```

Connect via MCP Inspector and call `chart.zoomToLevel`, `indicators.add`, etc.

## 📖 More Documentation

- [Rendering Engine Architecture](./docs/rendering-engine-architecture.md) - Core rendering pipeline and physical pixel alignment mechanism
- [Plugin System](./docs/PLUGIN_SYSTEM.md) - Extension mechanism and custom development
- [Renderer Development Guide](./docs/renderer-development-guide.md) - Custom renderer development

## 📋 Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| semanticConfig | `SemanticChartConfig` | **required** | Semantic configuration, the only control source for chart data and indicators |
| yPaddingPx | `number` | 0 | Y-axis padding in pixels |
| minKWidth | `number` | 2 | Minimum K-line width (logical pixels) |
| maxKWidth | `number` | 50 | Maximum K-line width (logical pixels) |
| rightAxisWidth | `number` | 0 | Right price axis width |
| bottomAxisHeight | `number` | 24 | Bottom time axis height |
| priceLabelWidth | `number` | 60 | Price label extra width for showing change percentage |
| zoomLevels | `number` | 20 | Total number of zoom levels |
| initialZoomLevel | `number` | 3 | Initial zoom level (1 ~ zoomLevels) |
| mcp | `McpConfig` | — | MCP bridge config: `{ wsUrl?, autoReconnect?, onToolCall? }`. See [@363045841yyt/klinechart-ai-runtime](packages/ai-runtime/README.md) |

## 🗺️ Roadmap

- [x] K-line zoom anchor stability, improved zoom feel
- [x] Right axis detached from scroll container, completely solving clipping issues
- [x] Blank area drawing support
- [x] Limit vertical pan range to prevent viewport from leaving data
- [x] Drawing system
- [x] Right axis zoom
- [x] Latest price line and right axis label style optimization
- [x] Area primitive tools and rendering
- [ ] More advanced drawing tools
- [ ] Support for minute, multi-day, monthly, and yearly K-line display
- [ ] Support convert the drawing to quant code

## 📦 Packages

| Package | Description | npm |
|---------|-------------|-----|
| `@363045841yyt/klinechart-core` | Headless chart engine + controllers | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-core) |
| `@363045841yyt/klinechart` | Vue 3 bindings | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart) |
| `@363045841yyt/klinechart-react` | React bindings | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-react) |
| `@363045841yyt/klinechart-angular` | Angular bindings | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-angular) |
| `@363045841yyt/klinechart-ai-runtime` | MCP server + AI tool schemas (optional) | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-ai-runtime) |

## 🚀 What's New

- **v0.8** Symbol comparison, multi-source data aggregation
- **v0.7** Renderer registration chain AOP refactoring with decorator syntax, monorepo split, Vue/React bindings (experimental), standalone core package, tokenized color system
- **v0.6.10** Unified WebGL rendering context sharing for all panes, plus sub-pane lifecycle refactoring — centralized pane instance management via SubPaneManager with first-class paneId identity
- **v0.6.6** Comprehensive rendering optimizations: batched price-to-Y calculations, cached tick positions and geometry, optimized month-key operations; achieves stable **190-200fps on 200Hz displays** with frame generation time down to **2ms**
- **v0.6.3** WebGL rendering for K-lines, volume bars, and MACD bars; significant performance boost across the board
- **v0.6.1** Dual-layer canvas architecture: Main + Overlay separation with UpdateLevel filtering, achieves stable **180fps with low jitter on 200Hz displays**
- **v0.6.0** Stateless indicator pipeline: MA/BOLL/EXPMA/ENE/RSI/CCI/STOCH/MOM/WMSR/KST/FASTK now use unified Calculator → Scheduler → StateStore → Renderer architecture for better performance and maintainability
- **v0.5.6** Logarithmic price axis with evenly distributed grid lines at pixel level
- **v0.5.2** Advanced drawing tools: parallel channel, regression channel, smooth top/bottom, and non-intersecting channel
- **v0.5.0** Complete drawing tool system, supporting line, rectangle, text drawing and style editing
- **v0.4** Modern UI, left toolbar, right axis optimization, TradingView-style zoom feel

## 📄 License

[MIT](LICENSE)
