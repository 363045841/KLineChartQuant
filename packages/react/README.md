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
- **WebGL Rendering** - K-lines, volume bars, and MACD bars rendered via WebGL for GPU-accelerated performance, reaching **190fps on 200Hz displays** with per-frame GPU time under **1ms**
- **Optimized Interaction** - Stable zoom anchor, precise crosshair cursor, smooth drag
- **Mobile-Optimized Interaction** - Long-press crosshair for data exploration, tap to dismiss, slide to browse data without triggering chart scroll, gesture-based scroll mode
- **Multi-Symbol Comparison** - Supports unlimited number of instruments for trend comparison
- **Multi-Source Aggregation** - Supports aggregation and unification of multiple data sources
- **Batch Data Export** - Select a date range and export multiple stocks' K-line data into a single CSV file, with progress indication
- **Custom Tooltip** - Fully customizable tooltip via named slots (`#kline-tooltip`, `#marker-tooltip`), with engine-provided hover data, position, and styling


## 🚀 Quick Start

```bash
npm install @363045841yyt/klinechart-react
```

### Basic Usage

```tsx
import { KLineChart } from '@363045841yyt/klinechart-react'
import type { ChartSettings } from '@363045841yyt/klinechart-core'

function App() {
  return (
    <KLineChart
      theme="dark"
      customData={demoData}
      settings={chartSettings}
    />
  )
}
```

For full setup including the data backend, see the [root README]../../README.md).

## 📖 More Documentation

- [Rendering Engine Architecture](../../docs/rendering-engine-architecture.md) - Core rendering pipeline and physical pixel alignment mechanism
- [Plugin System](../../docs/PLUGIN_SYSTEM.md) - Extension mechanism and custom development
- [Renderer Development Guide](../../docs/renderer-development-guide.md) - Custom renderer development


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


## 📄 License

[MIT](LICENSE)

