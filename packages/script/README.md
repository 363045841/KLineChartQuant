# @363045841yyt/klinechart-script

Deterministic time-series script engine for KLineChartQuant. Scripts are written in plain
TypeScript, so they carry the type system, debugger, and npm ecosystem with them.

The engine runs bar by bar and emits Plot points. It does not depend on any chart or data
source: the host supplies the bars and the chart adapter renders the result.

## Installation

```bash
npm install @363045841yyt/klinechart-script
# or
pnpm add @363045841yyt/klinechart-script
```

## Quick Start

Declare an indicator. `name` identifies it, `inputs` declares its parameters, and `onBar`
runs once per bar:

```ts
import { defineIndicator } from '@363045841yyt/klinechart-script'

export const openCloseAverage = defineIndicator({
  name: 'OC Average',
  pane: 'main',
  inputs: {},
  onBar(ctx) {
    ctx.plot((ctx.open + ctx.close) / 2, { id: 'oc-average' })
  },
})
```

A host calls `registerDefinedScripts()` once at startup. Every declaration then enters the
chart indicator catalog automatically, including scripts declared later:

```ts
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
import '@363045841yyt/klinechart-script/indicators'

registerDefinedScripts()
```

## Usage

Run a script over bars the host already holds and collect the plots:

```ts
import { executeScript } from '@363045841yyt/klinechart-script'

const collection = executeScript(openCloseAverage, bars)
// → { plots: [...], fills: [...] }
```

Pass a third argument to override the script's default inputs per run.
To stream bars from a data feed instead, use `runEngine`, which forwards results to an
`OutputSink`:

```ts
import { runEngine } from '@363045841yyt/klinechart-script'

await runEngine({ script: openCloseAverage, feed, sink, symbol: 'BTCUSDT', tf: '1h' })
```

## Contracts

| Group | Types |
| --- | --- |
| Input | `Bar`, `DataFeed`, `DataFeedRange` |
| Output | `PlotPoint`, `AlertEvent`, `LogEvent`, `OutputSink` |
| Script | `IndicatorDef`, `Ctx`, `InputSchema`, `PlotDeclaration`, `PlotFillDeclaration` |
| Plot | `Plot`, `PlotFill`, `PlotCollection` |

The Plot data model is shared with the chart engine through
`@363045841yyt/klinechart-plot-contracts` and re-exported here.

## Docs

- [`docs/indicator.md`](./docs/indicator.md) — writing an indicator script
- [`docs/strategy.md`](./docs/strategy.md) — planned
- [`docs/library.md`](./docs/library.md) — planned

## Commands

| Command | What |
| --- | --- |
| `pnpm build` | TypeScript declaration + JS emit to `dist/` |
| `pnpm test` | Vitest, Node environment |
| `pnpm lint:publish` | `publint --strict` package check |
