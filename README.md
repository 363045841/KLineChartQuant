High-performance financial chart library with a single-frame generation time of just 2ms, stable scrolling at 190–200fps in a 200Hz environment, native support for AI Agent control, full-link ResizeObserver-driven crisp rendering, and a pluggable architecture.


<div align="center">

English | [简体中文](README_CN.md)

# 📈 KLineChartQuant

**Crisp Rendering · High Performance · Optimized Interaction · Mobile-Friendly**

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
  <br/>
  <div style="display: flex; align-items: flex-start; justify-content: center; gap: 8px;">
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <img src="https://files.seeusercontent.com/2026/06/18/Uab4/pasted-image-1781798801155.webp" width="400" style="border-radius: 12px;" />
      <img src="https://files.seeusercontent.com/2026/06/18/Hcq8/QQ20260619000024.jpg" width="400" style="border-radius: 12px;" />
    </div>
  </div>
  <br/>
  <img src="https://files.seeusercontent.com/2026/06/20/Wp3o/I5_VJIL2D4VNPMUZC5E3C.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/06/20/0flS/1YHDQQB321JZ5QW.png" width="400" style="border-radius: 12px; margin: 8px;" />
</div>


## ✨ Core Features

- **Agent First / MCP Native** - Supports AI Agent direct control of charts via the [Model Context Protocol](https://modelcontextprotocol.io). Built-in WebSocket-bridged MCP server enables any MCP client (Inspector, Claude Desktop, Cursor, etc.) to zoom, pan, add/remove indicators, and change theme in real time
- **Crisp Rendering** - Full-chain ResizeObserver driven, physical pixel alignment, K-lines, wicks, and lines are sharp and clear on all DPR screens
- **Plugin Architecture** - Renderer plugin-based design, supporting dynamic registration, configuration, and lifecycle management
- **Custom Markers** - Supports semantic configuration of custom markers and custom information
- **High Performance** - Smoothly handles tens of thousands of data points, no lag during zoom or pan; supports **190-200fps on 200Hz displays** with single-frame generation time as low as **2ms**
- **Multi-Backend Rendering** - Submit drawing primitives once, render via **WebGPU**, **WebGL**, or **Canvas2D**. WebGPU provides hybrid DOM canvas (no `compositeTo` copy), single-command-buffer-per-frame submission with 4x MSAA, and per-instance geometry caching via ResourceTable. Automatic fallback chain: WebGPU → WebGL → Canvas2D. Reaching **190fps on 200Hz displays** with per-frame GPU time under **1ms**
- **Optimized Interaction** - Stable zoom anchor, precise crosshair cursor, smooth drag
- **Mobile-Optimized Interaction** - Long-press crosshair for data exploration, tap to dismiss, slide to browse data without triggering chart scroll, gesture-based scroll mode
- **Multi-Symbol Comparison** - Supports unlimited number of instruments for trend comparison
- **Multi-Source Aggregation** - Supports aggregation and unification of multiple data sources
- **Batch Data Export** - Select a date range and export multiple stocks' K-line data into a single CSV file, with progress indication
- **Custom Tooltip** - Fully customizable tooltip via named slots (`#kline-tooltip`, `#marker-tooltip`), with engine-provided hover data, position, and styling


## 📡 Data Sources

KLineChart requires a market data backend. Supported data sources:

| Data Source | Description | Docs |
|---|---|---|
| `gotdx` | Tongdaxin (GOTDX) quotes: A-share / futures / MAC, served by `KlineChartQuantGo` | [KlineChartQuantGo](docs/data-sources/klinechartquantgo.zh-CN.md) |
| `baostock` | BaoStock A-share daily / weekly / monthly & minute K-lines, served by `stockbao` | [BaoStock](docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView global instruments, served by `stockbao` | [BaoStock](docs/data-sources/baostock.zh-CN.md) |
| `mock` | Debug only: local MOCK-100 / MOCK-10000 K-lines, no backend needed, always online | — |

Backend repos live alongside this one (outside the monorepo). See each doc above for the specific startup steps.


## 🚀 Quick Start

### 3. Install and Use

```bash
npm install @363045841yyt/klinechart @363045841yyt/klinechart-core
```

**Use the component:**

```vue
<template>
  <div class="app-container" :data-theme="currentTheme">
    <KlineChart v-model:theme="currentTheme" :custom-data="customData" :settings="chartSettings" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import type { ChartSettings } from '@363045841yyt/klinechart-core'
  import { type CustomDataSource, KlineChart } from '@363045841yyt/klinechart'
  import demoData from './demo-data.json'

  const currentTheme = ref<'light' | 'dark'>('dark')

  const customData = ref<CustomDataSource>(demoData as CustomDataSource)

  const chartSettings: ChartSettings = {
    showGridLines: true,
    isAsiaMarket: true,
    showVolumePriceMarkers: false,
    leftAxisType: 'none',
    theme: 'dark',
    colorPresetSettings: {
      dark: {
        candleUpBody: '#e85d04',
        candleDownBody: '#1b4332',
        crosshairLine: '#faa307',
        gridMajor: '#3e2723',
      },
    },
  }
</script>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 80vh;
  }

  .app-container[data-theme='dark'] {
    background: #000;
    color: #e5e7eb;
  }
</style>
```

**Import CSS in main.ts:**

```typescript
import '@363045841yyt/klinechart/style.css'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

**Slot Usage — Custom Tooltip:**

```html
<KlineChart>
  <template #kline-tooltip="{ hoverData, upColor, downColor }">
    <div class="custom-tooltip">
      <div class="custom-tooltip__title">
        <span>{{ hoverData.stockCode }}</span>
        <span>{{ formatTimestamp(hoverData.timestamp, { timeZone: 'Asia/Shanghai' }) }}</span>
      </div>
      <div
        class="custom-tooltip__price"
        :style="{ color: hoverData.close >= hoverData.open ? upColor : downColor }"
      >
        {{ hoverData.close.toFixed(2) }}
      </div>
      <div class="custom-tooltip__detail">
        O: {{ hoverData.open.toFixed(2) }}<br />
        H: {{ hoverData.high.toFixed(2) }}<br />
        L: {{ hoverData.low.toFixed(2) }}<br />
        C: {{ hoverData.close.toFixed(2) }}
      </div>
    </div>
  </template>
</KlineChart>
```

**Slot Usage — Custom Main-Pane Legend:**

Providing `#legend` fully replaces the default Canvas legend. The slot scope is the full `LegendTemplateContext` (OHLC, timeshare, main indicators, comparisons, layout, colors).

```vue
<template #legend="{ index, currentBar, timeshare, indicators, comparisons, colors }">
  <div class="my-legend">
    <!-- Custom fields added to KLineData[] for PR #98 are exposed through currentBar -->
    <div v-if="currentBar" class="my-legend__row">
      <span :style="{ color: currentBar.color }">
        开盘 {{ currentBar.open.toFixed(2) }} 最高 {{ currentBar.high.toFixed(2) }} 最低
        {{ currentBar.low.toFixed(2) }} 收盘 {{ currentBar.close.toFixed(2) }}
      </span>
      <span v-if="currentBar.volumeText"> Vol {{ currentBar.volumeText }}</span>
    </div>

    <div v-if="timeshare" class="my-legend__row">
      <span :style="{ color: timeshare.changeColor }">
        现价 {{ timeshare.price.toFixed(2) }} 涨幅 {{ timeshare.changePercent.toFixed(2) }}%
      </span>
    </div>

    <!-- Using main chart indicator legend data -->
    <div v-for="indicator in indicators" :key="indicator.name" class="my-legend__row">
      <span>{{ indicator.name }}:</span>
      <template v-for="value in indicator.values" :key="value.label">
        <span :style="{ color: value.color }">
          {{ value.label }} {{ value.value.toFixed(3) }}
        </span>
      </template>
    </div>
    <!-- Using comparison commodity data -->
    <div
      v-for="comparison in comparisons"
      :key="comparison.symbol"
      class="my-legend__row"
      :style="{ color: comparison.percentColor }"
    >
      {{ comparison.symbol }}
      {{ comparison.percent > 0 ? '+' : '' }}{{ comparison.percent.toFixed(2) }}%
    </div>
  </div>
</template>
```


### 4. (Optional) Enable MCP / AI Agent Control

```bash
npm install @363045841yyt/klinechart-ai-runtime
```

```vue
<template>
  <div class="app-container">
    <KlineChart ref="chartRef" :mcp="mcpConfig" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { KlineChart } from '@363045841yyt/klinechart'
  import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

  const chartRef = ref<InstanceType<typeof KlineChart> | null>(null)

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

<style>
  .app-container {
    height: 80vh;
  }
</style>
```

Then start the MCP server:

```bash
cd packages/ai-runtime
pnpm inspect
```

Connect via MCP Inspector and call `chart.zoomToLevel`, `indicators.add`, etc.


## 📖 More Documentation

- [Rendering Pipeline](docs/rendering-pipeline.md) - Current paint path: FrameTransaction, Scene/Layer, Renderer backends


## 📋 Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| semanticConfig | `SemanticChartConfig` | — | Semantic configuration (optional). When provided, drives chart data, indicators, markers and chart options |
| dataFetcher | `DataFetcher` | built-in | Data fetching function. Defaults to an internal fetcher that proxies `/api/stock` |
| theme | `'light' \| 'dark'` | — | Chart theme. Use `v-model:theme` for two-way binding |
| isFullscreen | `boolean` | — | Controlled fullscreen state. Leave unbound for internal (non-controlled) mode |
| timezone | `string` | `'Asia/Shanghai'` | Time zone for date/time display |
| yPaddingPx | `number` | 20 | Y-axis padding in pixels |
| minKWidth | `number` | 1 | Minimum K-line width (logical pixels) |
| maxKWidth | `number` | 50 | Maximum K-line width (logical pixels) |
| rightAxisWidth | `number` | 0 | Right price axis width |
| leftAxisWidth | `number` | 0 | Left price axis width (0 = hidden) |
| bottomAxisHeight | `number` | 24 | Bottom time axis height |
| priceLabelWidth | `number` | 60 | Price label extra width for showing change percentage |
| zoomLevels | `number` | 20 | Total number of zoom levels |
| initialZoomLevel | `number` | 3 | Initial zoom level (1 ~ zoomLevels) |
| customData | `CustomDataSource` | — | Inline data bundle: `{ symbol?, period?, data, comparisons? }`. Bypasses the fetcher pipeline entirely. See example above |
| teleportContainer | `string \| HTMLElement` | — | Teleport target for dropdowns/modals (CSS selector or element). Defaults to internal `.chart-wrapper` |
| mcp | `McpConfig` | — | MCP/AI runtime bridge config: `{ wsUrl?, autoReconnect?, onToolCall? }`. See [@363045841yyt/klinechart-ai-runtime](packages/ai-runtime/README.md) |


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

- **v0.9.0** Self-developed Core-layer reactive state model migration, timing issues eliminated
- **v0.9.0** Single-path Scene renderer + WebGPU backend (hybrid DOM canvas, no compositeTo), FrameTransaction reactivity, device-lost recovery, auto-fallback WebGPU → WebGL → Canvas2D
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

