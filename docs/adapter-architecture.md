# Adapter Architecture: Signal + Controller Cross-Framework Design

## 1. Overview

KLineChart uses a three-framework adapter layer (Vue 3, React 18+/19+, Angular 17+/18+/19+) that shares a single core engine through two abstractions:

- **ChartController** — an interface facade that wraps the legacy `Chart` engine class
- **Signal\<T\>** — a lightweight reactive primitive for streaming state (push-based)

The goal is zero direct `Chart` class imports from any adapter: all communication flows through `ChartController` and its Signal properties. The adapters bridge core Signals to their own reactivity system (`shallowRef`, `useSyncExternalStore`, `signal()`).

```
┌──────────────────────────────────────────────────────────────────┐
│                    Framework Adapters                            │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  @363045841yyt/  │  │ @363045841yyt│  │ @363045841yyt/     │  │
│  │  klinechart-vue  │  │ /klinechart- │  │ klinechart-angular │  │
│  │  (KLineChart.vue)│  │ react        │  │ (kline-chart)      │  │
│  └────────┬─────────┘  └─────┬────────┘  └─────────┬──────────┘  │
└───────────┼──────────────────┼─────────────────────┼─────────────┘
            │                  │                     │
            └──────────────────┴─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   ChartController   │  ← public interface
                    │   (framework-       │
                    │    agnostic)        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Core Engine        │
                    │  (Chart, Renderers, │
                    │   Plugin System)    │
                    └─────────────────────┘
```

## 2. Signal Primitive

The core defines a zero-dependency `Signal<T>` type in `packages/core/src/reactivity/signal.ts`:

```typescript
type Signal<T> = {
  /** Read current value; tracked when called inside effect() */
  (): T
  /** Read without tracking */
  peek: () => T
  /** Write new value; notifies subscribers if Object.is differs */
  set: (next: T) => void
  /** Subscribe to changes; returns unsubscribe function */
  subscribe: (listener: () => void) => () => void
}
```

Key design choices:

- **Dual read**: `signal()` triggers tracking inside `effect`; `signal.peek()` reads silently
- **Push-based**: `subscribe(cb)` is the external API; `effect()` is the internal auto-tracker
- **Reference equality**: writes only notify when `Object.is(old, next)` is false
- **No proxy wrapping**: values are immutable snapshots — each `peek()` returns the current value

## 3. ChartController Interface

`ChartController` is the single public interface that every adapter consumes. It combines two responsibilities:

1. **State as Signal\<T\>** — read-only observable properties
2. **Methods** — imperative mutation (write) + queries (narrow getters)

### 3.1 Signals (10 read-only state streams)

| Signal | Type | Description |
|--------|------|-------------|
| `viewport` | `Signal<ChartViewport>` | Visible window: zoom, scroll, dimensions, DPR |
| `data` | `Signal<ReadonlyArray<KLineData>>` | K-line data array |
| `theme` | `Signal<'light' \| 'dark'>` | Current theme |
| `indicators` | `Signal<ReadonlyArray<IndicatorInstance>>` | Active indicator instances |
| `subPanes` | `Signal<ReadonlyArray<SubPaneInfo>>` | Sub-pane layout info |
| `drawingTool` | `Signal<DrawingToolType \| null>` | Active drawing tool |
| `drawings` | `Signal<ReadonlyArray<DrawingObject>>` | All drawing objects |
| `paneRatios` | `Signal<Readonly<Record<string, number>>>` | Pane size ratios |
| `paneLayout` | `Signal<ReadonlyArray<PaneSpec>>` | Full pane layout specs |
| `interactionState` | `Signal<InteractionSnapshot>` | Crosshair, hover, tooltip state |

### 3.2 Static Data

| Property | Type | Description |
|----------|------|-------------|
| `catalog` | `ReadonlyArray<IndicatorDefinition>` | Available indicator registry |

### 3.3 Mutations

**Data:**
- `setData(data)`, `appendData(data)`, `updateData(data)` — replace/append/refresh
- `getData()` — read current data
- `getZoomLevelCount()` — total zoom levels

**Theme / Zoom:**
- `setTheme(theme)` — toggle light/dark
- `zoomToLevel(level, anchorX?)`, `zoomIn(anchorX?)`, `zoomOut(anchorX?)`

**Interaction (forwarded from DOM handlers):**
- `handlePointerEvent(e, drawingController?)` → returns whether event was consumed
- `handleWheelEvent(e)`, `handleScrollEvent()`
- `handlePinchZoom(delta, centerClientX)`

**Indicators:**
- `addIndicator(definitionId, role, params?)` — add and return instance ID
- `removeIndicator(instanceId)` — remove by ID
- `updateIndicatorParams(instanceId, params)`
- `updateRendererConfig(name, config)` — configure renderer

**Drawing / Markers:**
- `setDrawingTool(tool)`, `clearDrawings()`, `removeDrawing(drawingId)`
- `updateCustomMarkers(markers)`, `clearCustomMarkers()`

**Layout:**
- `createSubPane(paneId, indicatorId, params?)`, `clearSubPanes()`
- `replaceSubPaneIndicator(paneId, indicatorId, params?)`
- `updatePaneLayout(panes)`, `resizeSubPane(paneId, deltaY)`

**Tooltip / Settings:**
- `setTooltipSize(size)`, `setTooltipAnchorPositioning(enabled)`
- `updateSettingsFacade(settings)`, `updateOptionsFacade(options)`

### 3.4 Queries

| Method | Return | Description |
|--------|--------|-------------|
| `getIndicatorTitle(instanceId)` | `string \| undefined` | Read indicator label |
| `getContentWidth()` | `number` | Total scrollable content width |

### 3.5 DrawingChartAdapter (inherited)

`ChartController` extends `DrawingChartAdapter`, a narrow interface consumed by `DrawingInteractionController`:

```typescript
interface DrawingChartAdapter {
  setDrawings(drawings: any[]): void
  setSelectedDrawingId(id: string | null): void
  getViewport(): DrawingChartViewport | null
  getKWidthKGap(): { kWidth: number; kGap: number }
  getCurrentDpr(): number
  getData(): ReadonlyArray<KLineData>
  getLogicalIndexAtX(mouseX: number): number | null
  getTimestampAtLogicalIndex(index: number): number | null
  priceToY(paneId: string, price: number): number
  yToPrice(paneId: string, y: number): number
  getPaneInfo(paneId: string): PaneInfo | undefined
}
```

### 3.6 Lifecycle

| Method | Description |
|--------|-------------|
| `dispose()` | Tear down DOM, listeners, and all internal subscriptions |

## 4. Factory: `createChartController()`

The single entry point for all frameworks:

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'

const controller = createChartController({
  container: document.getElementById('chart'),
  data: klineData,
  initialZoomLevel: 5,
  theme: 'light',
})
```

`ChartMountOptions`:

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `container` | yes | `HTMLElement` | Host element |
| `data` | yes | `ReadonlyArray<KLineData>` | Initial K-line data |
| `initialZoomLevel` | no | `number` | Starting zoom level |
| `zoomLevels` | no | `number` | Total zoom levels |
| `theme` | no | `'light' \| 'dark'` | Initial theme |
| `yPaddingPx`, `rightAxisWidth`, `bottomAxisHeight`, `priceLabelWidth`, `minKWidth`, `maxKWidth` | no | `number` | Chart option overrides |
| `canvasLayer`, `rightAxisLayer`, `xAxisCanvas` | no | `HTMLElement \| HTMLCanvasElement` | Pre-existing DOM (optional — framework may supply its own) |

## 5. Framework Adapter Patterns

### 5.1 Vue 3 (`@363045841yyt/klinechart`)

**Signal bridge:**

```typescript
import { shallowRef, onScopeDispose } from 'vue'
import type { Signal } from '@363045841yyt/klinechart-core/reactivity'

export function coreSignalToVueRef<T>(signal: Signal<T>): Ref<T> {
  const ref = shallowRef(signal.peek())
  const unsub = signal.subscribe(() => { ref.value = signal.peek() })
  onScopeDispose(unsub)
  return ref
}
```

**Usage pattern** (`KLineChart.vue`):

```vue
<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from 'vue'
import { createChartController, type ChartController } from '@363045841yyt/klinechart-core/controllers'

const containerRef = ref<HTMLDivElement>()
const controller = shallowRef<ChartController | null>(null)

onMounted(() => {
  controller.value = createChartController({
    container: containerRef.value!,
    data: props.data,
    theme: props.theme,
  })
  // Subscribe via coreSignalToVueRef
  const viewportRef = coreSignalToVueRef(controller.value.viewport)
  effect(() => { /* react to viewportRef.value */ })
})

onUnmounted(() => {
  controller.value?.dispose()
  controller.value = null
})
</script>
```

**Imports from controllers facade (no direct engine/ paths):**

```typescript
import {
  createChartController,
  type ChartController,
  type PaneSpec,
  type IndicatorInstance,
  type SubIndicatorType,
  type InteractionSnapshot,
  zoomLevelToKWidth,
  kGapFromKWidth,
  SUB_PANE_INDICATOR_CONFIGS,
  SUB_PANE_INDICATORS,
  DrawingInteractionController,
} from '@363045841yyt/klinechart-core/controllers'
```

### 5.2 React 18/19 (`@363045841yyt/klinechart-react`)

**Signal bridge via `useSyncExternalStore`:**

```typescript
import { useSyncExternalStore } from 'react'

export function useChart(ref, opts): ChartController | null {
  const [controller, setController] = useState<ChartController | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const created = createChart({ ...opts, container })
    setController(created)
    return () => { setController(null); created.dispose() }
  }, [ref])

  return controller
}
```

**Subscribing to signals:**

```typescript
export function useViewport(controller: ChartController): ChartViewport {
  const store = controller.viewport
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb), [store])
  const getSnapshot = useCallback(() => store(), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
```

**Convenience component:**

```tsx
<KLineChart ref={handleRef} data={data} theme="dark" />

// Imperative access via ref:
handleRef.current?.zoomToLevel(3)
handleRef.current?.addIndicator('MA', 'main')
```

### 5.3 Angular 17+ (`@363045841yyt/klinechart-angular`)

**Signal bridge (Angular signal wrapper):**

```typescript
import { signal as ngSignal } from '@angular/core'
import type { Signal as CoreSignal } from '@363045841yyt/klinechart-core'

export function coreSignalToAngular<T>(
  source: CoreSignal<T>,
  destroyRef?: DestroyRef,
): Signal<T> {
  const ng = ngSignal<T>(source.peek())
  const unsubscribe = source.subscribe(() => ng.set(source.peek()))
  const ref = destroyRef ?? inject(DestroyRef)
  ref.onDestroy(unsubscribe)
  return ng.asReadonly()
}
```

**Component usage:**

```typescript
@Component({
  selector: 'kline-chart',
  standalone: true,
  template: '<div #container></div>',
})
export class KLineChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container') container!: ElementRef

  ngAfterViewInit(): void {
    const ctrl = createChart({ container: this.container.nativeElement, data, factory })
    this.controller = ctrl
    // Bridge signals
    ctrl.viewport.subscribe(() => this.viewport.set(ctrl.viewport.peek()))
  }
}
```

**DI integration:**

```typescript
bootstrapApplication(AppComponent, {
  providers: [provideKLineChart({ theme: 'dark' })]
})
```

## 6. State Flow

```
User Action (pointer/scroll/click)
       │
       ▼
   Framework Adapter Event Handler
   (Vue @pointermove / React onPointerMove / Angular (pointermove))
       │
       ▼
   ChartController.handlePointerEvent(e)
       │
       ▼
   Core Engine updates internal state
       │
       ├──► Signal.notify()
       │        │
       │        ▼
       │    Framework Reactivity Bridge
       │    (shallowRef.set / useSyncExternalStore / ngSignal.set)
       │        │
       │        ▼
       │    Component Re-render (reactive subscriptions)
       │
       └──► ChartController method returns result
```

### Bidirectional flows

Some state originates from the framework (not the engine):

```
Framework State Change       Engine State Change
(Vue zoomLevel ref)          (Signal notifies framework)
       │                             ▲
       ▼                             │
ChartController.zoomToLevel()        │
       │                             │
       ▼                             │
Core Engine updates viewport ────────┘
       │
       ▼
viewport Signal notifies framework
```

## 7. Adapter Contracts

### 7.1 Composition (no class inheritance)

All three adapters use **composition**:

| Framework | Abstraction | Mechanism |
|-----------|-------------|-----------|
| Vue 3 | Composable (`useChart`) + Component (`KLineChart`) | `shallowRef<ChartController>` + `coreSignalToVueRef` |
| React | Hook (`useChart`) + Component (`KLineChart`) | `useState<ChartController>` + `useSyncExternalStore` |
| Angular | Component (`KLineChartComponent`) + Provider | `controller: ChartController` + `coreSignalToAngular` |

### 7.2 SSR Safety

- **Vue**: DOM access only inside `onMounted` (client-only)
- **React**: DOM access inside `useEffect` (runs only on client)
- **Angular**: `isPlatformBrowser(this.platformId)` guard

All adapters return `null` (or equivalent) during SSR until mounted.

### 7.3 Testing

Each adapter package ships its own contract test suite that injects a mock `ChartControllerFactory` to verify lifecycle, signal bridging, and error handling without instantiating the full engine:

```
packages/
  react/src/__tests__/contract.test.ts
  angular/src/__tests__/contract.test.ts
  vue/src/__tests__/contract.test.ts
```

The mock factory is registered via:

```typescript
// Vue
import { __setChartFactory } from '@363045841yyt/klinechart'

// React
import { __setChartFactory } from '@363045841yyt/klinechart-react'

// Angular
import { provideKLineChart } from '@363045841yyt/klinechart-angular'
```

## 8. Public API Surface

```
@363045841yyt/klinechart-core
├── controllers/          ← ChartController + factories
├── semantic/             ← SemanticChartController
├── plugin/               ← Plugin system APIs
├── reactivity/           ← Signal, computed, effect
└── types/price           ← KLineData type

@363045841yyt/klinechart          ← Vue 3 bindings
@363045841yyt/klinechart-react    ← React bindings
@363045841yyt/klinechart-angular  ← Angular bindings
```

## 9. Design Rationale

### Why Signal + Controller, not a single Reactive class?

- **Framework agnostic**: The core has zero import from any framework
- **SSR safe**: No DOM access at module scope; adapters defer mount to lifecycle hooks
- **Testable**: Signals can be created without DOM; controllers can be mocked
- **Layered**: Framework adapters own reactivity bridging; core owns business logic

### Why was the `_chart` escape hatch removed?

`ChartController` previously exposed a `_chart: unknown` property for `DrawingInteractionController`. This was eliminated in Phase 7 by introducing a `DrawingChartAdapter` interface that exposes only the 11 methods needed by the drawing system. The adapter is:

- Narrow by design (no access to renderers, plugin host, or internal engine state)
- Implemented by `ChartController` via delegation to `chart.*`
- Consumed by `DrawingInteractionController` (which now accepts `DrawingChartAdapter` instead of `Chart`)

### Why are some engine utilities re-exported from controllers?

Functions like `zoomLevelToKWidth()` and `SUB_PANE_INDICATOR_CONFIGS` are needed by adapter code at initialization time (before the controller is created). Rather than forcing Vue/React/Angular to import from internal `engine/*` paths, `@363045841yyt/klinechart-core/controllers` re-exports them as a unified facade.

## 10. Quick Start

```bash
npm install @363045841yyt/klinechart  # Vue
# or
npm install @363045841yyt/klinechart-react   # React
# or
npm install @363045841yyt/klinechart-angular  # Angular
```

```typescript
// Vue 3
import { useChart, coreSignalToVueRef } from '@363045841yyt/klinechart'
const { controller, viewport } = useChart(containerRef, { data })
```

```typescript
// React
import { useChart, useViewport } from '@363045841yyt/klinechart-react'
const controller = useChart(divRef, { data })
const viewport = useViewport(controller)
```

```typescript
// Angular
import { provideKLineChart } from '@363045841yyt/klinechart-angular'
// In template: <kline-chart [data]="klineData" />
```

## 11. Migration Notes

The adapter architecture was introduced incrementally across 10 phases:

1. Pane title renderer → core engine
2. ChartController extended with 7 methods
3. Callbacks → Signal migration
4. ChartStore eliminated (dual SSOT)
5. KLineChart.vue switched from `new Chart()` to `createChartController()`
6. SemanticChartAdapter exported
7. DrawingInteractionController → DrawingChartAdapter
8. computeContentWidth migrated, chart-store.ts deleted
9. Engine sub-path imports converged into controllers facade
10. Final cleanup

All phases verified: same pre-existing test failures, zero regressions.
