# @363045841yyt/klinechart-core

Framework-independent K-line chart runtime with a signal-based state kernel, multi-backend rendering, and no UI framework dependency.

## Overview

`@363045841yyt/klinechart-core` is the runtime behind the KLineChartQuant framework bindings. It owns chart state, viewport and pane calculation, input handling, data coordination, and rendering. It creates and manages the chart DOM and canvases, but leaves application UI to Vue, React, Angular, or a custom adapter.

The public application boundary is `ChartController`:

- Read chart state through `ReadonlySignal` values.
- Change chart state through controller methods.
- Forward browser input events from a custom host when needed.
- Dispose the controller when its host is unmounted.

## Installation

```bash
npm install @363045841yyt/klinechart-core
# or
pnpm add @363045841yyt/klinechart-core
# or
yarn add @363045841yyt/klinechart-core
```

## Quick Start

Create a container with a non-zero size in CSS before mounting the chart.

```typescript
import { createChartController, type KLineData } from '@363045841yyt/klinechart-core/controllers'

const container = document.querySelector<HTMLElement>('#chart')
if (!container) throw new Error('Chart container not found')

const data: KLineData[] = [
  {
    timestamp: 1704067200000,
    open: 100,
    high: 105,
    low: 98,
    close: 103,
    volume: 10_000,
  },
]

const chart = createChartController({
  container,
  data,
  initialZoomLevel: 3,
  theme: 'light',
})

// Signals are callable. subscribe() returns an unsubscribe function.
const unsubscribe = chart.viewport.subscribe(() => {
  const viewport = chart.viewport()
  console.log(viewport.visibleFrom, viewport.visibleTo)
})

chart.addIndicator('MA', 'main')
chart.zoomIn()

// Call both when the host is removed.
unsubscribe()
chart.dispose()
```

`createChartController` currently creates synchronously. Its factory type also permits an asynchronous implementation, so framework adapters should support `ChartController | Promise<ChartController>` when accepting a configurable factory.

## State Kernel

The engine is built around `ChartStateKernel`, the single source of truth for chart business state. It composes independent state modules for options, zoom, data, viewport, pane layout, settings, system theme, chart mode, drawing, interaction, comparisons, indicators, markers, and renderer runtime.

```text
Controller method / DOM input
            |
            v
StateKernel action writes source state
            |
            v
computed ReadonlySignal derives snapshots
            |
            +-------------------+
            v                   v
framework adapter         ChartRenderer / Scene
```

The boundary is intentional:

- Public controller state is `ReadonlySignal<T>`: read it with `signal()`, read without tracking with `signal.peek()`, or observe it with `signal.subscribe()`.
- Only kernel actions own writable signals. Consumers cannot call `.set()` on public controller state.
- Derived values such as viewport, visible range, effective theme, pane layout, and interaction snapshots are computed automatically.
- Related writes are batched so consumers observe one consistent business snapshot rather than intermediate states.
- DOM observation and rendering are side effects outside the state derivation layer.

The reactivity primitives are also available from the package root or `@363045841yyt/klinechart-core/reactivity`:

```typescript
import {
  batch,
  computed,
  createSignal,
  effect,
  type ReadonlySignal,
} from '@363045841yyt/klinechart-core/reactivity'

const count = createSignal(0)
const doubled: ReadonlySignal<number> = computed(() => count() * 2)

const stop = effect(() => {
  console.log(doubled())
})

batch(() => count.set(1))
stop()
```

Use these primitives for a custom adapter or an isolated extension. Application code that controls a chart should use `ChartController` methods instead of reaching into the engine state.

## Controller API

Import the controller contracts from the dedicated subpath:

```typescript
import {
  createChartController,
  type ChartController,
  type ChartMountOptions,
  type KLineData,
  type SymbolSpec,
} from '@363045841yyt/klinechart-core/controllers'
```

### Mount Options

`ChartMountOptions` accepts the host `container` and optional initial data or symbols. It also supports initial zoom, light or dark theme preference, chart settings, market sessions, layout dimensions, and pre-existing DOM layers for framework hosts.

Use `data` for immediately available K-line data. Use `symbols` to drive the registered market-data provider pipeline. For application-owned data, `applyCustomData()` provides an atomic bundle that bypasses fetching.

### Readonly State

`ChartController` exposes these `ReadonlySignal` groups:

| Group | Signals |
| --- | --- |
| Viewport | `viewport`, `data`, `dataLoading`, `dataError`, `symbols`, `symbolCatalog` |
| Appearance and runtime | `theme`, `settings`, `rendererRuntime` |
| Chart model | `chartMode`, `lastBarPeriod`, `paneRatios`, `paneLayout` |
| Indicators and drawings | `indicators`, `subPanes`, `drawingTool`, `drawings`, `selectedDrawingId`, `legendTemplateContext` |
| Interaction and comparison | `interactionState`, `comparisonColors`, `comparisonLoading` |

`theme` is the effective `light` or `dark` theme. It is derived from the user preference in `settings.theme` and the value supplied through `setSystemTheme()` when the preference is `auto`.

### Data and Modes

```typescript
chart.setData(nextBars)
chart.appendData(laterBars)
chart.updateData(revisedBars)

chart.setSymbols([
  { symbol: '000001', market: 'CN', period: 'daily', source: 'baostock' },
])

chart.addComparisonSymbol({ symbol: '000002', market: 'CN', period: 'daily' })
chart.removeComparisonSymbol('000002')
chart.switchToTimeShareForDate(20240102)
```

For fetch-backed data, register providers and symbols through the market-data API. `setCurrentSymbol()` and `setCurrentPeriod()` update the current selection without fetching; `resetToFetcher()` returns a custom-data chart to the provider pipeline.

### Viewport, Theme, and Input

```typescript
chart.zoomToLevel(5)
chart.zoomIn()
chart.zoomOut()
chart.scrollToRight()

chart.setTheme('dark')
chart.setSystemTheme('dark')

host.addEventListener('wheel', (event) => chart.handleWheelEvent(event))
host.addEventListener('scroll', () => chart.handleScrollEvent())
host.addEventListener('pointermove', (event) => chart.handlePointerEvent(event))
```

When Core owns the default DOM scaffold, its interaction bindings are installed during mount. A framework host that manages events can forward pointer, wheel, scroll, and pinch events through the controller methods.

### Indicators, Panes, and Drawings

```typescript
const id = chart.addIndicator('MACD', 'sub', { fast: 12, slow: 26, signal: 9 })
if (id) chart.updateIndicatorParams(id, { fast: 10, slow: 20, signal: 7 })

chart.createSubPane('rsi-pane', 'RSI', { period1: 6, period2: 12, period3: 24 })
chart.resizeSubPane('rsi-pane', 24)

chart.setDrawingTool('trend-line')
chart.clearDrawings()
```

Use `catalog` to render an indicator picker. The controller also provides marker updates, controlled pane layout operations, drawing selection, tool-session registration, and narrow layout and data queries. Refer to the exported `ChartController` type for the complete stable facade.

## Rendering Architecture

Rendering is independent of framework reactivity and reads the same kernel-derived viewport and visible range as interaction and indicator scheduling.

```text
Chart
  -> StateKernel + ChartViewportManager
  -> ChartRenderer + FrameTransaction
  -> Scene / Layer
  -> RendererHost
  -> WebGPU, WebGL, or Canvas2D fallback
```

- `ChartViewportManager` owns `ResizeObserver` and scroll DOM events; the kernel derives effective DPR, viewport, visible range, and K-line spacing.
- `FrameTransaction` coalesces high-frequency draw requests and seals frame geometry before any layer paints.
- `Scene` orders layers by pane, role, visibility, and z-index. Main and overlay updates are separate, so crosshair movement does not repaint static content.
- `RendererHost` owns backend lifecycle, resize, switching, and degradation. The renderer reports whether a GPU batch was rendered; layers perform a complete Canvas2D fallback when it was not.
- Coordinates exposed to chart logic are logical pixels. Canvas buffers and GPU viewports use the kernel's effective DPR and physical pixels.

For the runtime contract, extension rules, backend behavior, and diagnostics, see [the rendering pipeline](../../docs/rendering-pipeline.md).

## Additional Public APIs

| Import path | Use |
| --- | --- |
| `@363045841yyt/klinechart-core` | Reactivity, controller exports, errors and recovery helpers, input contracts, Scene and renderer-facing contracts, chart features, component data models, `VERSION` |
| `@363045841yyt/klinechart-core/controllers` | Recommended application-facing chart controller, data/provider facade, indicator catalog, drawing controller |
| `@363045841yyt/klinechart-core/reactivity` | Signal primitives and frame transaction contracts |
| `@363045841yyt/klinechart-core/market-data` | Market-data providers, registry, source contracts, and query types |
| `@363045841yyt/klinechart-core/semantic` | Validated semantic chart configuration types and pure `toKLineChartProps()` mapping |
| `@363045841yyt/klinechart-core/plugin` | Plugin host, events, and plugin contracts for extensions |
| `@363045841yyt/klinechart-core/config` | Chart settings definitions and defaults |
| `@363045841yyt/klinechart-core/version` | Package `VERSION` |

Engine-prefixed subpaths are available for advanced integrations, but they expose lower-level contracts. Prefer the controller, market-data, semantic, plugin, and reactivity entry points for application code.

## Semantic Configuration

The semantic module converts a validated, declarative configuration into props suitable for a chart host. It does not create a chart or mutate a controller.

```typescript
import {
  toKLineChartProps,
  type SemanticChartConfig,
} from '@363045841yyt/klinechart-core/semantic'

const config: SemanticChartConfig = {
  version: '1.0.0',
  data: {
    source: 'baostock',
    market: 'CN',
    symbol: '000001',
    startDate: '2024-01-01',
    endDate: '2024-06-01',
    period: 'daily',
    adjust: 'qfq',
  },
  indicators: {
    main: [{ type: 'MA', enabled: true, params: { periods: [5, 10, 20] } }],
    sub: [{ type: 'MACD', enabled: true }],
  },
}

const { symbols, indicators, customMarkers } = toKLineChartProps(config)
```

Apply the returned values through a framework binding's props, or through the controller APIs appropriate to the host. Validate externally supplied input first with `SemanticConfigValidator`.

## Browser Requirements

Core requires a browser environment with DOM, `ResizeObserver`, Canvas 2D, and modern ECMAScript support. It selects an available rendering backend and degrades safely when GPU capabilities are unavailable:

```text
WebGPU preference: WebGPU -> WebGL -> Canvas2D
WebGL preference:  WebGL -> Canvas2D
Canvas preference: Canvas2D
```

The default synchronous host attempts WebGL and falls back to Canvas2D. WebGPU is selected through renderer settings and can degrade at runtime if the device is lost.

## Related Packages

- `@363045841yyt/klinechart` - Vue 3 bindings
- `@363045841yyt/klinechart-react` - React bindings
- `@363045841yyt/klinechart-angular` - Angular bindings

{{include:_license.md}}
