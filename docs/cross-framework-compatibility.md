# Cross-Framework Compatibility: Vue SFC, Web Component, React, and Regular

## 1. Goal

KLineChart needs to run in multiple frontend stacks without forking the chart engine. The current strategy has two layers:

- **Core engine layer**: `@363045841yyt/klinechart-core` owns rendering, interaction, indicators, drawing, semantic configuration, and controller state.
- **Framework adapter layer**: Vue, React, Angular, and future Regular adapters only mount the core, bridge reactivity, and expose framework-friendly APIs.
- **Web Component layer**: the existing Vue SFC implementation can also be compiled into a Custom Element so non-Vue applications can reuse the full Vue UI surface with a standard DOM tag.

This gives us two compatibility paths:

- Native adapters for teams that want idiomatic framework APIs and direct `ChartController` access.
- `<kline-chart>` for teams that want one packaged UI artifact that can be dropped into React, Regular, plain HTML, or other hosts.

## 2. Shared Boundary

The most important design choice is that framework code does not own chart behavior. It talks to the core through stable data and controller contracts:

- `SemanticChartConfig` describes what should be shown.
- `DataFetcher` lets the host inject data loading without coupling the package to a specific backend.
- `ChartController` exposes imperative methods such as `setData`, `setTheme`, `zoomToLevel`, `addIndicator`, and `dispose`.
- Core `Signal<T>` streams expose viewport, indicators, pane ratios, drawing state, and interaction snapshots.

Because the core boundary is framework-agnostic, each adapter only solves three local problems:

1. How to mount and dispose the controller.
2. How to pass complex values into the component.
3. How to subscribe to core state using the framework's own reactivity model.

## 3. Vue SFC as the Source UI

The Vue package contains the most complete UI implementation today. `packages/vue/src/components/KLineChart.vue` owns the composed interface around the canvas engine:

- left toolbar and drawing tools
- indicator selector and parameter editing
- tooltip and marker tooltip layers
- right-axis interaction host
- pane separator overlay
- fullscreen state and internal teleport target handling

The component still delegates actual chart behavior to the core:

```ts
import {
  createChartController,
  type ChartController,
} from '@363045841yyt/klinechart-core/controllers'
```

It receives semantic inputs as props:

```ts
semanticConfig: SemanticChartConfig
dataFetcher: DataFetcher
```

This matters for compatibility. The Vue SFC is not a Vue-only chart engine. It is a Vue-hosted shell around the shared engine. That shell can be published as normal Vue bindings or compiled into a Web Component.

## 4. Vue Web Component Build

The Web Component entry lives in `packages/vue/src/web-component.ts`:

```ts
import { defineCustomElement } from 'vue'
import KLineChartVue from './components/KLineChart.vue'

const KLineChartElement = defineCustomElement(KLineChartVue, {
  shadowRoot: true,
})

customElements.define('kline-chart', KLineChartElement)

export { KLineChartElement }
export default KLineChartElement
```

Key points:

- `defineCustomElement` converts the Vue SFC into a standards-based Custom Element class.
- `shadowRoot: true` isolates the component DOM and styles from the host app.
- `customElements.define('kline-chart', ...)` registers the public tag.
- The entry also exports the element class so bundlers can import and register it deterministically.

The Vue package exposes the Web Component through `package.json`:

```json
{
  "exports": {
    "./web-component": {
      "import": {
        "default": "./dist/kline-chart.js"
      }
    }
  }
}
```

Consumers can import `@363045841yyt/klinechart/web-component` once, then use `<kline-chart>` wherever the browser supports Custom Elements.

## 5. Build Configuration

`packages/vue/vite.config.ts` switches between a normal Vue library build and a Web Component build with `BUILD_TARGET=web-component`:

```ts
const isWC = process.env.BUILD_TARGET === 'web-component'

export default defineConfig({
  plugins: [
    vue({ customElement: isWC }),
    Icons({ compiler: 'vue3', autoInstall: true }),
    ...(isWC ? [cssInjectedByJs()] : [dts(...)])
  ],
  build: {
    emptyOutDir: !isWC,
    codeSplitting: !isWC,
    cssCodeSplit: !isWC,
    lib: isWC
      ? {
          entry: './src/web-component.ts',
          name: 'KLineChartWC',
          formats: ['es'],
          fileName: () => 'kline-chart.js',
        }
      : {
          entry: './src/index.ts',
          name: 'KLineChartVue',
          formats: ['es', 'cjs'],
          fileName: (format) => format === 'es' ? 'index.js' : 'index.cjs',
        },
    rollupOptions: {
      external: isWC ? [] : ['vue', /@363045841yyt\/klinechart-core/],
      output: isWC ? { inlineDynamicImports: true } : { globals: { vue: 'Vue' } },
    },
  },
})
```

The important build decisions are:

- **Normal Vue package** externalizes `vue` and `@363045841yyt/klinechart-core`, emits ESM/CJS, and generates declaration files.
- **Web Component package** bundles its runtime dependencies into one ESM file, emits `dist/kline-chart.js`, and inlines dynamic imports.
- `cssInjectedByJs()` is enabled only for the Web Component build so component styles travel with the element instead of requiring a separate stylesheet import.
- `emptyOutDir: !isWC` prevents the Web Component build from deleting files produced by the normal library build.
- `codeSplitting: !isWC` and `inlineDynamicImports: true` make the Custom Element easier to consume from host apps.

The package scripts reflect that split:

```json
{
  "build": "vite build && node -e \"require('fs').copyFileSync('dist/index.d.ts','dist/index.d.cts')\"",
  "build:wc": "cross-env BUILD_TARGET=web-component vite build"
}
```

## 6. Passing Data Across the DOM Boundary

Custom Element attributes are strings. KLineChart needs to receive complex objects and functions, especially `SemanticChartConfig` and `DataFetcher`. The React wrapper therefore assigns them as DOM properties instead of attributes:

```ts
const el = hostRef.current
el.semanticConfig = props.semanticConfig
el.dataFetcher = props.dataFetcher
```

Primitive options still map cleanly to attributes:

```ts
el.setAttribute('initial-zoom-level', String(props.initialZoomLevel))
el.setAttribute('zoom-levels', String(props.zoomLevels))
el.setAttribute('is-fullscreen', String(props.isFullscreen))
```

This split is the core rule for all non-Vue hosts:

- Use properties for objects, arrays, callbacks, functions, and other non-string values.
- Use attributes for numbers, booleans, and simple configuration values that Vue Custom Elements can coerce from kebab-case attributes into props.

## 7. What React Does Today

React currently has two integration surfaces.

### 7.1 React Native Adapter

`packages/react/src/index.ts` provides an idiomatic React adapter that creates a core controller directly:

- `KLineChart` mounts a plain `div`, calls `createChart`, stores the controller in a ref, and disposes it on unmount.
- `useChart` lets callers mount a controller into their own element.
- `useViewport`, `usePaneRatios`, `useIndicators`, and `useInteractionState` bridge core `Signal<T>` streams into React with `useSyncExternalStore`.
- `forwardRef` and `useImperativeHandle` expose imperative chart methods safely to React callers.

This path is best when a React app wants direct access to the shared chart engine and is willing to build its own surrounding controls.

### 7.2 React Web Component Wrapper

`packages/react/src/KLineChartWC.tsx` wraps `<kline-chart>` for React apps that want the full Vue UI implementation:

```tsx
return (
  <kline-chart
    ref={hostRef}
    style={props.style}
    className={props.className}
  />
)
```

The wrapper handles work that React does not do automatically for Custom Elements:

- It forwards a typed element ref with `forwardRef` and `useImperativeHandle`.
- It assigns complex values through DOM properties.
- It writes primitive props to kebab-case attributes.
- It listens for Custom Events such as `zoom-level-change` and `toggle-fullscreen` and maps them back to React callbacks.
- It declares JSX support for the custom tag through `packages/react/src/jsx.d.ts`.

This keeps React usage ergonomic while preserving the Web Component as the single reusable UI artifact.

## 8. Event Naming and Host Contracts

Vue component events are declared in camelCase:

```ts
const emit = defineEmits<{
  (e: 'zoomLevelChange', level: number, kWidth: number): void
  (e: 'toggleFullscreen'): void
}>()
```

When compiled as a Custom Element, host applications should listen at the DOM boundary. The React wrapper listens for kebab-case DOM events:

```ts
el.addEventListener('zoom-level-change', onZoom as EventListener)
el.addEventListener('toggle-fullscreen', onToggle as EventListener)
```

For compatibility, every host wrapper should treat the Custom Element as a DOM API:

- attributes use kebab-case
- events use kebab-case
- complex values are assigned as properties
- lifecycle cleanup removes every event listener added by the wrapper

## 9. Why This Works Across Frameworks

The compatibility story works because each boundary uses the right abstraction:

- Canvas rendering is owned by the core, not by any framework renderer.
- State changes are emitted through `Signal<T>`, which can be adapted to Vue refs, React external stores, Angular signals, or Regular component state.
- The full Vue UI can be exported through Web Components when a host framework does not need a native adapter.
- Data fetching is injected, so the chart package does not depend on Vue Query, React Query, Redux, Pinia, Regular stores, or a specific transport.
- The DOM boundary follows browser standards, so React and future Regular wrappers do not need to understand Vue internals.

## 10. What Regular Can Do Next

Regular has two realistic integration paths.

### 10.1 Wrap the Web Component First

The fastest Regular integration is to consume the existing Web Component:

1. Import `@363045841yyt/klinechart/web-component` once at app startup or inside the Regular package entry.
2. Render `<kline-chart>` from a Regular component.
3. Assign `semanticConfig` and `dataFetcher` as element properties after mount and whenever they change.
4. Reflect primitive props such as `initialZoomLevel`, `zoomLevels`, and `isFullscreen` as attributes.
5. Register DOM listeners for `zoom-level-change` and `toggle-fullscreen`, then remove them during component teardown.

This is the lowest-risk path because it reuses the existing Vue UI and only requires a small host wrapper.

### 10.2 Build a Native Regular Adapter Later

A native Regular adapter is useful if Regular users need direct controller access or want to render their own controls instead of using the Vue UI. It should follow the same pattern as React:

1. Mount a host `div`.
2. Call `createChartController({ container, ...options })` after the element exists.
3. Store the returned `ChartController` on the component instance.
4. Subscribe to `Signal<T>` streams and call Regular's state update mechanism when snapshots change.
5. Expose a small imperative API for `setData`, `setTheme`, `zoomToLevel`, indicator operations, and `dispose`.
6. Dispose the controller and unsubscribe from all signals during teardown.

Regular should not duplicate chart rendering, indicator calculation, drawing interaction, or semantic loading. Those stay in core. The adapter should remain a lifecycle and reactivity bridge.

## 11. Practical Checklist

When adding another framework host, keep the contract small:

- Import the Web Component only once, or guard registration with `customElements.get('kline-chart')` if a host might load multiple bundles.
- Pass functions and objects through properties, not attributes.
- Normalize public DOM events to kebab-case.
- Keep teardown explicit: remove listeners, unsubscribe from signals, and call `dispose` on native adapters.
- Do not couple host wrappers to Vue internals or component refs inside the shadow root.
- Keep the core package as the owner of rendering and behavior.

This is how KLineChart can support Vue, React, Angular, Regular, and plain browser hosts without multiplying chart engines or letting framework-specific UI code leak into the rendering core.
