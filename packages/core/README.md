# @363045841yyt/klinechart-core

Headless, reactive K-line (candlestick) chart engine with zero framework dependencies.

## Overview

`@363045841yyt/klinechart-core` provides the foundational charting engine powering the `@363045841yyt/klinechart` monorepo. It handles data management, rendering coordination, viewport calculations, and plugin orchestration — all without touching any UI framework.

## Installation

```bash
npm install @363045841yyt/klinechart-core
# or
pnpm add @363045841yyt/klinechart-core
# or
yarn add @363045841yyt/klinechart-core
```

## Quick Start

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'
import type { KLineData } from '@363045841yyt/klinechart-core'

const controller = createChartController({
  container: document.getElementById('chart'),
  data: [],
  initialZoomLevel: 3,
  theme: 'light'
})

// Load data
const data: KLineData[] = [
  { timestamp: 1704067200000, open: 100, high: 105, low: 98, close: 103, volume: 10000 },
  // ...
]
controller.setData(data)

// Cleanup when done
controller.dispose()
```

## Exports

### Controllers
- `createChartController` — Factory for creating chart instances
- `ChartController` — Main controller interface

### Reactivity
- `Signal<T>` — Reactive primitive for state management
- `effect`, `peek` — Reactive utilities

### Engine
- `ChartController` — Public chart interface (via `@363045841yyt/klinechart-core/controllers`)
- `createChartController` — Factory for creating controller instances
- Renderers (internal — use controllers facade)

### Plugin System
- `PluginHost` — Plugin registration and lifecycle
- `EventBus` — Cross-component communication
- `StateStore` — Global state management

### Types
- `KLineData` — Candlestick data point
- `ChartViewport` — Viewport state
- `InteractionSnapshot` — Interaction state

### Subpath Exports

The package provides granular subpath imports for tree-shaking:

```typescript
// Controllers (recommended)
import { createChartController } from '@363045841yyt/klinechart-core/controllers'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'

// Utils (also available via controllers re-export)
import { zoomLevelToKWidth } from '@363045841yyt/klinechart-core/controllers'

// Config
import { DEFAULT_SETTINGS } from '@363045841yyt/klinechart-core/config'

// Plugin
import { EventBus } from '@363045841yyt/klinechart-core/plugin'

// Version
import { VERSION } from '@363045841yyt/klinechart-core/version'
```

## Architecture

```
┌─────────────────────────────────────┐
│          Controllers                │  ← High-level API
├─────────────────────────────────────┤
│        Plugin System                │  ← EventBus, StateStore
├─────────────────────────────────────┤
│          Engine                     │  ← Chart, ChartStore
├─────────────────────────────────────┤
│        Renderers                    │  ← Canvas/WebGL renderers
├─────────────────────────────────────┤
│        Reactivity                   │  ← Signal-based state
└─────────────────────────────────────┘
```

## ChartController API

### Creating a Controller

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'

const controller = createChartController({
  container: HTMLElement,
  data: KLineData[],
  initialZoomLevel?: number,
  zoomLevels?: number,
  theme?: 'light' | 'dark',
  yPaddingPx?: number,
  minKWidth?: number,
  maxKWidth?: number
})
```

### Methods

- `setData(data: KLineData[]): void` — Update chart data
- `setTheme(theme: 'light' | 'dark'): void` — Change theme
- `zoomToLevel(level: number, anchorX?: number): void` — Zoom to specific level
- `zoomIn(anchorX?: number): void` — Zoom in
- `zoomOut(anchorX?: number): void` — Zoom out
- `addIndicator(definitionId: string, role: 'main' | 'sub', params?): string` — Add indicator
- `removeIndicator(instanceId: string): boolean` — Remove indicator
- `dispose(): void` — Cleanup and destroy

### Reactive State

Access reactive state via signals:

```typescript
// Current viewport
controller.viewport.subscribe((vp) => {
  console.log('Zoom level:', vp.zoomLevel)
})

// Active indicators
controller.indicators.subscribe((inds) => {
  console.log('Active indicators:', inds)
})

// Interaction state
controller.interactionState.subscribe((state) => {
  console.log('Hover:', state.hover)
})
```

## Semantic Configuration

For AI/LLM-driven chart configuration, use the semantic controller:

```typescript
import { SemanticChartController } from '@363045841yyt/klinechart-core/semantic'

const semantic = new SemanticChartController(chartInstance)

// Apply natural language config
semantic.applyConfig({
  "stockSymbol": "AAPL",
  "dateRange": { "start": "2024-01-01", "end": "2024-06-01" },
  "indicators": ["MA20", "MACD", "RSI"],
  "chart": {
    "chartType": "candlestick",
    "theme": "dark",
    "gridLines": { "horizontal": true, "vertical": false }
  },
  "display": {
    "paneRatios": { "main": 0.6, "sub1": 0.4 }
  }
})
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires support for:
- ResizeObserver
- Canvas 2D Context
- ES2022 (or transpile)

## License

MIT © 363045841

## Related Packages

- `@363045841yyt/klinechart` — Vue 3 bindings
- `@363045841yyt/klinechart-react` — React bindings (coming soon)
- `@363045841yyt/klinechart-angular` — Angular bindings (coming soon)