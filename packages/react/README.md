High-performance financial charting library with WebGPU / WebGL / Canvas2D rendering, a QuickJS indicator runtime, and an Agent-native API.


<div align="center">

English | [简体中文](README_CN.md)

# 📈 KLineChartQuant

[![npm version](https://img.shields.io/npm/v/@363045841yyt/klinechart.svg?style=flat&color=blue)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![npm downloads](https://img.shields.io/npm/dm/@363045841yyt/klinechart.svg?style=flat&color=green)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![license](https://img.shields.io/npm/l/@363045841yyt/klinechart.svg?style=flat&color=orange)](https://github.com/363045841/klinechart/blob/main/LICENSE) [![demo](https://img.shields.io/badge/Demo-Online-purple?style=flat)](https://363045841.github.io/KLineChartQuant/)

[![qq](https://img.shields.io/badge/QQ-672011965-blue?style=flat)](https://qm.qq.com/q/672011965) [![tg](https://img.shields.io/badge/Telegram-Join-26A5E4?style=flat&logo=telegram)](https://t.me/+1o-6B-wVRTU2MjQ9)

</div>

---


A lightweight financial K-line charting library for quantitative trading, with an Agent-native API and built-in script indicators.


## 🤖 Agent-Native Architecture

KLineChartQuant exposes chart capabilities as `@Tool` primitives on the chart core. The Agent calls the same entry points as the UI: one state source, one execution path, no bridge layer and no side-channel state.

- **Same primitives** — UI actions and Agent tools share `ChartController`; tools are a subset of actions.
- **Single source of truth** — `StateKernel` owns chart state; external consumers read readonly signals.
- **No MCP bridge** — tools register directly on the core, so one call reaches the kernel without a DSL or a duplicated state copy.


## ✨ Core Features

- **Agent Native** - Chart capabilities are `@Tool`-decorated domain primitives; the Agent calls the same primitives as the UI, with one shared state and one execution path
- **Script Indicators** - Write indicators in plain TypeScript. Sandboxed QuickJS execution with time and memory budgets, a built-in editor with completions and hover signatures, and plots that flow through the normal rendering chain
- **Crisp Rendering** - Full-chain ResizeObserver driven, physical pixel alignment, K-lines, wicks, and lines stay sharp on all DPR screens
- **Plugin Architecture** - Renderer plugin-based design with dynamic registration, configuration, and lifecycle management
- **High Performance** - Handles tens of thousands of data points without lag during zoom or pan; benchmark numbers are in the Performance section
- **Multi-Backend Rendering** - Submit drawing primitives once and render via **WebGPU**, **WebGL**, or **Canvas2D**, with automatic fallback. WebGPU uses a hybrid DOM canvas (no `compositeTo` copy), single-command-buffer-per-frame submission, 4x MSAA, and per-instance geometry caching via ResourceTable
- **Optimized Interaction** - Stable zoom anchor, precise crosshair cursor, smooth drag
- **Mobile-Optimized Interaction** - Long-press crosshair for data exploration, tap to dismiss, slide to browse data without triggering chart scroll, gesture-based scroll mode
- **Multi-Symbol Comparison** - Compare multiple instruments on one chart
- **Multi-Source Aggregation** - Aggregate and unify multiple data sources
- **Batch Data Export** - Select a date range and export multiple stocks' K-line data into a single CSV file, with progress indication
- **Custom Tooltip** - Fully customizable tooltip via the `#kline-tooltip` slot, with engine-provided hover data, position, and styling


## 🚀 Quick Start

This adapter is an internal monorepo module and is not published to npm. The published product is
[`@363045841yyt/klinechart`](../vue/README.md); the examples below run from this repository.

### Basic Usage

`KLineChartWC` renders the full KCQ UI (toolbar, indicators, drawings, settings) through the Vue-built Web Component:

```tsx
import { KLineChartWC } from '@363045841yyt/klinechart-react'

function App() {
  return <KLineChartWC zoomLevels={12} style={{ width: '100%', height: '100%' }} />
}
```

### Direct Core Mount

`KLineChart` mounts `@363045841yyt/klinechart-core` directly, with no Vue runtime in the bundle, for hosts that build their own UI. Core loads on the client only; the server renders an empty container. Pointer, wheel, and touch input are wired through the shared core binding `bindChartInput`; pass `input={{ intercept }}` to add drawing intercepts, or `input={false}` to forward events yourself.

```tsx
import type { ChartController, KLineData } from '@363045841yyt/klinechart-core'
import { KLineChart, useCoreSignal } from '@363045841yyt/klinechart-react'
import { useState } from 'react'

function Chart({ data }: { data: KLineData[] }) {
  const [controller, setController] = useState<ChartController | null>(null)
  const viewport = useCoreSignal(controller?.viewport)
  return (
    <>
      <KLineChart symbols={symbols} theme="dark" onReady={setController} />
      <span>{viewport?.kWidth}</span>
    </>
  )
}
```

Bundlers that do not tree-shake (Metro, Expo DOM components) should import from `@363045841yyt/klinechart-react/direct`, which omits the Web Component and its Vue UI. The host element must have a definite size; the chart fills it.

`useKLineChart(containerRef, options)` is the same mount as a hook, for hosts that own the container element. It reads `containerRef.current` once after the first render, so render the container unconditionally.

For full setup including the data backend, see the [root README]../../README.md).

## 📖 More Documentation

- [Rendering Pipeline](../../docs/rendering/rendering-pipeline.md) - Current paint path: FrameTransaction, Scene/Layer, Renderer backends
- [Script Indicators](../../packages/script/docs/indicator.md) - Declaring an indicator in TypeScript: inputs, Plot API, libraries


## 🗺️ Roadmap

- [ ] Convert drawings to quantitative code


## 📄 License

[Apache-2.0](LICENSE)

