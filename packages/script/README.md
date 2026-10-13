# @363045841yyt/klinechart-script

Deterministic time-series script engine for KLineChartQuant. A script is a single JavaScript
file executed in an embedded QuickJS runtime, so the host runs untrusted user scripts without
giving them access to the page.

The engine compiles a script once, then runs it bar by bar and collects Plot points. It does
not depend on any chart or data source: the host supplies the bars and the chart adapter
renders the result.

## Installation

```bash
npm install @363045841yyt/klinechart-script
# or
pnpm add @363045841yyt/klinechart-script
```

## Script shape

One file declares exactly one indicator and is also the source shown in the editor. Metadata,
parameters and calculation live in the same document:

```js
defineIndicator({
  name: 'OC Average',
  pane: 'sub',
  inputs: {
    n: input(2, '除数'),
  },
  onBar() {
    plot((open[0] + close[0]) / params.n, { id: 'oc-average' })
  },
})
```

The VM prelude injects these globals before the script runs:

| Global | Meaning |
| --- | --- |
| `open` `high` `low` `close` `volume` `time` | price series; `close[0]` is the current bar, `close[1]` one bar back |
| `params` | resolved input values |
| `plot(value, { id, color })` | emit a plot point for the current bar |
| `input(default, title?)` | declare a parameter |
| `defineIndicator(definition)` | declare the single indicator of the file |
| `defineLibrary(name, members)` / `importLibrary(name)` | declare and use a library |

A series returns `NaN` when the requested history is not yet available, and never exposes
future bars.

## Execution

The runtime is WASM-backed and loads asynchronously once. Preload it, then use the synchronous
entry points, which is what the chart's synchronous compute port calls:

```ts
import { preloadQuickJS, runQuickJSScriptSync, readQuickJSScriptDefinitionSync } from '@363045841yyt/klinechart-script'

await preloadQuickJS()
const definition = readQuickJSScriptDefinitionSync(source) // metadata only, no bars
const collection = runQuickJSScriptSync({ source, bars, params: { n: 2 } })
// → { plots: [...], fills: [...] }
```

`runQuickJSScript` is the async variant used before the module is preloaded.

Both entry points run each Context with a time and memory budget, so a runaway user script
fails instead of hanging the host.

## Libraries

Libraries are JavaScript sources loaded into the same VM through one protocol:

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService([
  { name: 'stats', source: `defineLibrary('stats', { mean: (values) => values[0] })` },
])
```

The built-in `ta` library (`sma`, `ema`, `rsi`, `highest`, `lowest`, `crossover`,
`crossunder`) uses the exact same `defineLibrary` call. See `builtinLibraries` for the manifest.

## Contracts

| Group | Types |
| --- | --- |
| Input | `Bar`, `DataFeed`, `DataFeedRange` |
| Output | `PlotPoint`, `AlertEvent`, `LogEvent`, `OutputSink` |
| QuickJS | `QuickJSRunOptions`, `QuickJSScriptDefinition`, `QuickJSLibrary` |
| Library | `LibraryModules`, `LibraryExports`, `TechnicalAnalysisLibrary` |
| Plot | `Plot`, `PlotFill`, `PlotCollection` |

The Plot data model is shared with the chart engine through
`@363045841yyt/klinechart-plot-contracts` and re-exported here.

## Commands

| Command | What |
| --- | --- |
| `pnpm build` | TypeScript declaration + JS emit to `dist/` |
| `pnpm test` | Vitest, Node environment |
| `pnpm lint:publish` | `publint --strict` package check |
