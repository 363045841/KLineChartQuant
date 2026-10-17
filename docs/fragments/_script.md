## 📜 Script Indicators

Indicators can be written as plain TypeScript instead of being compiled ahead of time. A script is one file that declares a single indicator through `defineIndicator`; the engine compiles it once, then runs it bar by bar and collects Plot points. Scripts are data-source and render agnostic — the host supplies the bars, the chart adapter renders the result.

```js
defineIndicator({
  name: 'Volume Tide',
  position: Position.Sub,
  onBar() {
    const RED = '#F08080'
    const RED_LIGHT = 'rgba(240, 128, 128, 0.5)'
    const RED_LIGHTER = 'rgba(240, 128, 128, 0.15)'
    const GREEN = '#008000'
    const GREEN_LIGHT = 'rgba(0, 128, 0, 0.5)'
    const GREEN_LIGHTER = 'rgba(0, 128, 0, 0.1)'
    const GRAY_LIGHTER = 'rgba(128, 128, 128, 0.15)'

    const barUp = ta.rising(close, 1)
    const barDn = ta.falling(close, 1)
    const volumeChange = ta.change(volume)

    const volumeColor = barUp
      ? RED_LIGHTER
      : barDn ? GREEN_LIGHTER : GRAY_LIGHTER

    plot.Columns(volume, 'Volume columns', {
      color: volumeColor,
    })

    const volumeChangeColor = barUp
      ? (volumeChange > 0 ? RED : RED_LIGHT)
      : barDn
        ? (volumeChange > 0 ? GREEN : GREEN_LIGHT)
        : Color.Gray

    plot.Histogram(volumeChange, 'Volume change columns', {
      color: volumeChangeColor,
      size: 12,
    })

    plot.Line(0, 'Zero line', {
      color: Color.Gray,
    })
  },
})
```

Everything a script needs is injected as a global before it runs:

| Global | Meaning |
| --- | --- |
| `open` `high` `low` `close` `volume` `time` | price series; `close` reads the current bar, `close[1]` one bar back |
| `input.int` `input.float` `input.bool` `input.string` | declare a parameter at the top level of `onBar`; the variable reads back the user's value |
| `plot.Line` `plot.Columns` `plot.Histogram` `plot.Point` `plot.Shape` `plot.Char` `plot.Arrow` | emit plot points; the method name selects the shape; each returns a handle |
| `plot.Candle` `plot.Bar` | emit candles or OHLC bars from four prices; candles support separate body, wick, and border colors; return `void` |
| `fill(from, to, color, title, options?)` | fill the area between two plots; `from` / `to` are handles returned by `plot.*` |
| `ta` | built-in technical analysis library |
| `Position` | `Position.Main` or `Position.Sub` |
| `Color` | common Material 400 colors, or pass any CSS color string |
| `defineIndicator` / `defineLibrary` / `importLibrary` | declare the indicator, declare a library, use a library |

Parameters are plain `const` declarations, so the variable name is the parameter identity — no `inputs` block and no `params` object:

```js
onBar() {
  const period = input.int(20, { title: 'Period', min: 1 })
  const type = input.string('SMA', { options: ['SMA', 'EMA'] })
  plot.Line(type === 'SMA' ? ta.sma(close, period) : ta.ema(close, period), 'ma')
}
```

The built-in `ta` library covers `sma`, `ema`, `wma`, `vwma`, `rsi`, `highest`, `lowest`, `crossover`, `crossunder`, `rising`, `falling` and `change`. User libraries use the same `defineLibrary` call and join the same global namespace.

- **Sandboxed execution** - Scripts run in an embedded QuickJS runtime with per-run time and memory budgets, so a runaway script fails instead of hanging the host
- **No future data** - History that is not yet available reads as `NaN`; a script can never look ahead
- **Real editor** - The chart ships a CodeMirror-based script editor with completions, hover signatures, and signature help generated from the same declarations the compiler uses
- **Same rendering path** - Plots flow through the engine's normal Plot, axis, and legend chain, so script indicators behave exactly like built-in ones

Register scripts through the script service; each one then appears in the indicator picker as a normal entry:

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService()
await scripts.create(source)
```

See the [script docs]({{root}}packages/script/docs/indicator.md) for the full declaration reference, [libraries]({{root}}packages/script/docs/library.md), and [Plot API]({{root}}packages/script/docs/indicator.md#plot).
