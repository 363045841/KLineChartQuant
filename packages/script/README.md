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
  position: Position.Sub,
  onBar() {
    const n = input.float(2, { title: '除数' })
    plot.Line((open + close) / n, 'oc-average')
  },
})
```

The VM prelude injects these globals before the script runs:

| Global | Meaning |
| --- | --- |
| `open` `high` `low` `close` `volume` `time` | price series; `close` reads the current bar, `close[1]` one bar back |
| `input.int` `input.float` `input.bool` `input.string` | declare a parameter at the top level of `onBar`; the variable reads back the user's value |
| `plot.Line(value, name, options?)` | emit a plot point; methods: `Line`, `Columns`, `Histogram`, `Point`, `Shape`, `Char`, `Arrow` |
| `fill(from, to, color, title, options?)` | fill the area between two plots; `from` / `to` are the handles returned by `plot.*` |
| `Position` | indicator registration location; `Position.Main` or `Position.Sub` |
| `Color` | common Material 400 colors, or pass any CSS color string |
| `defineIndicator(definition)` | declare the single indicator of the file |
| `defineLibrary(name, members)` / `importLibrary(name)` | declare and use a library |

A series returns `NaN` when the requested history is not yet available, and never exposes
future bars. Numeric contexts accept the series directly: `close - open` equals `close[0] - open[0]`,
while series parameters such as `ta.sma(close, 20)` still receive the whole series.

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

The built-in `ta` library (`sma`, `ema`, `wma`, `vwma`, `rsi`, `highest`, `lowest`, `crossover`,
`crossunder`, `rising`, `falling`, `change`) uses the exact same `defineLibrary` call. See
`builtinLibraries` for the manifest.

## Contracts

| Group | Types |
| --- | --- |
| Input | `Bar`, `DataFeed`, `DataFeedRange` |
| Output | `PlotPoint`, `AlertEvent`, `LogEvent`, `OutputSink` |
| QuickJS | `QuickJSRunOptions`, `QuickJSScriptDefinition`, `QuickJSLibrary` |
| Library | `LibraryModules`, `LibraryExports`, `TechnicalAnalysisLibrary` |
| Plot | `Plot`, `PlotFill`, `PlotCollection` |
| Input schema | `InputSchema`, `ScriptParamValue` |

The Plot data model is shared with the chart engine through
`@363045841yyt/klinechart-plot-contracts` and re-exported here.

## Docs

| Document | Covers |
| --- | --- |
| [`docs/indicator.md`](docs/indicator.md) | Indicator declaration, inputs, Plot API, colors, fill |
| [`docs/library.md`](docs/library.md) | `defineLibrary` / `importLibrary`, loading, editor summaries |
| [`docs/series.md`](docs/series.md) | Series semantics and history access |
| [`docs/strategy.md`](docs/strategy.md) | Strategy-shaped scripts |

## Commands

| Command | What |
| --- | --- |
| `pnpm build` | TypeScript declaration + JS emit to `dist/` |
| `pnpm test` | Vitest, Node environment |
| `pnpm lint:publish` | `publint --strict` package check |

## License

[AGPL-3.0-or-later](LICENSE)

This package is part of the monorepo's AGPL island: it may depend on the Apache-2.0
packages, but no Apache-2.0 package may import or bundle it. Source for a published
version is available from the
[KLineChartQuant repository](https://github.com/363045841/KLineChartQuant/tree/main/packages/script)
under the matching release tag.
