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
  <img src="https://files.seeusercontent.com/2026/09/11/8qhO/c13205e.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/09/11/r3bV/1b3b978.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <br/>
  <img src="https://files.seeusercontent.com/2026/09/11/7Fkg/b602f74.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/09/11/4Yxu/11e2d91.jpg" width="400" style="border-radius: 12px; margin: 8px;" />
  <br/>
  <img src="https://files.seeusercontent.com/2026/09/11/Wv2q/e549295.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/09/11/udP5/Agent.png" width="400" style="border-radius: 12px; margin: 8px;" />
</div>


## 🤖 Agent-Native Architecture

KLineChartQuant treats the Agent as a first-class citizen of the chart, equal in standing to the human user. It is not a chat layer bolted on top: the Agent operates the chart through the same primitives as the UI, and the endpoints it acts on are exposed by the chart core itself.

- **The Agent is the user, and the user is the Agent**: The Agent is not a guest of the chart; it is an operator with the same standing as the person in front of the screen. Everything a user can do through the UI, the Agent can do through the same entry points, and vice versa. Equality of access is the design premise, not a toggle.

- **The Agent serves the chart, not a stream of text**: An embedded Agent exists to drive the chart the user is looking at, not to bury them in prose. Its output lands as real interaction on the surface the user sees—indicators, drawings, viewport changes—with conversation only as the means. The chart and its interaction remain the subject.

- **AI-Native architecture, not a parasitic layer**: Tools are woven into the chart API primitives as aspects rather than wrapped in a separate layer, so there is one implementation, naturally consistent state, and zero bridge overhead. Zed is the reference: its agent is built into the editor's own foundation (GPUI). VS Code is the counter-example: Copilot and Claude Code enter through the extension layer, where the Claude extension is essentially a GUI wrapper around an external CLI. The former makes the Agent native; the latter makes it parasitic.

- **The Agent pushes the architecture toward stability and efficiency**: Adding an Agent adds no architectural burden; it forces the architecture to be better. Because every capability must be exposed through a single API and unified primitives, state is consolidated into one source of truth and kept absolutely consistent—scattered state, derived copies, multi-write paths, parallel pipelines, and races cannot survive. The Agent and the user travel the same path, and that constraint settles into a more stable, testable chart core.

- **No blind use of MCP**: The project evolved through three stages—an early JSON-configuration approach, then MCP, and finally an AI-Native architecture. MCP demands an intermediate layer or DSL that spends tokens, loses information, and keeps a second copy of state that invades frontend logic. The current design drops the bridge entirely: tools register directly on the chart core, and a single call reaches the kernel.

- **The reactive kernel is the Agent's foundation**: StateKernel is the single source of truth—only actions may write, computed values derive automatically, and external consumers receive readonly signals, backed by batched atomic snapshots and frozen state. The kernel is zero-dependency, extremely light, and has controllable render timing. This lets the Agent share the user's exact state at near-zero cost and keeps tools a subset of actions rather than a parallel system.


## ✨ Core Features

- **Agent Native** - The chart core exposes its capabilities as `@Tool`-decorated domain primitives, and the Agent calls the same primitives as the UI. Tools are a subset of actions: one shared state, one execution path, no bridge layer
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


## 🚀 Quick Start

```bash
npm install @363045841yyt/klinechart-react
```

### Basic Usage

```tsx
import { KLineChartWC } from '@363045841yyt/klinechart-react'
import type { SemanticChartConfig } from '@363045841yyt/klinechart-react'

function App() {
  const semanticConfig: SemanticChartConfig = {
    data: { type: 'kline' },
  }

  return <KLineChartWC semanticConfig={semanticConfig} zoomLevels={12} />
}
```

For full setup including the data backend, see the [root README]../../README.md).

## 📖 More Documentation

- [Rendering Pipeline](../../docs/rendering-pipeline.md) - Current paint path: FrameTransaction, Scene/Layer, Renderer backends


## 🗺️ Roadmap

- [x] v0.10: AI-native chart support
- [x] K-line zoom anchor stability, improved zoom feel
- [x] Right axis detached from scroll container, completely solving clipping issues
- [x] Blank area drawing support
- [x] Limit vertical pan range to prevent viewport from leaving data
- [x] Drawing system
- [x] Right axis zoom
- [x] Latest price line and right axis label style optimization
- [x] Area primitive tools and rendering
- [x] More advanced drawing tools
- [x] Support for minute, multi-day, monthly, and yearly K-line display
- [ ] Support convert the drawing to quant code


## 📦 Packages

| Package | Description | npm |
|---------|-------------|-----|
| `@363045841yyt/klinechart-core` | Headless chart engine + controllers | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-core) |
| `@363045841yyt/klinechart` | Vue 3 bindings | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart) |
| `@363045841yyt/klinechart-react` | React bindings | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-react) |
| `@363045841yyt/klinechart-angular` | Angular bindings | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-angular) |
| `@363045841yyt/klinechart-agent-runtime` | Framework-neutral Agent runtime (Pi orchestration + host contracts) | — |
| `@363045841yyt/klinechart-ai-runtime` | Deprecated: legacy MCP addon, superseded by `agent-runtime` | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-ai-runtime) |


## 📄 License

[MIT](LICENSE)

