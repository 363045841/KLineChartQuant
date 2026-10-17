## 📜 脚本指标

指标不必提前编译，可以直接用 TypeScript 编写。一份脚本就是一个文件，通过 `defineIndicator` 声明单个指标；引擎只编译一次，随后逐 bar 执行并收集 Plot 点。脚本与数据源、渲染后端无关——宿主提供 K 线，图表适配层负责绘制结果。

```js
defineIndicator({
  name: '成交量潮汐',
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

脚本运行前，宿主会注入所需的全部全局变量：

| 全局 | 含义 |
| --- | --- |
| `open` `high` `low` `close` `volume` `time` | 行情序列；`close` 取当前 K 线，`close[1]` 取前一根 |
| `input.int` `input.float` `input.bool` `input.string` | 在 `onBar` 顶层声明参数，变量本身就是用户设置的值 |
| `plot.Line` `plot.Columns` `plot.Histogram` `plot.Point` `plot.Shape` `plot.Char` `plot.Arrow` | 输出绘图点，方法名决定图形；每个方法返回可被 `fill` 引用的句柄 |
| `plot.Candle` `plot.Bar` | 接收 OHLC 四个价格，输出蜡烛或美国线；蜡烛支持独立实体、影线、边框色，返回 `void` |
| `fill(from, to, color, title, options?)` | 填充两个 Plot 之间的区域；`from` / `to` 是 `plot.*` 返回的句柄 |
| `ta` | 内置技术分析函数库 |
| `Position` | `Position.Main` 主图或 `Position.Sub` 副图 |
| `Color` | Material 400 常用色，也可直接写任意 CSS 颜色字符串 |
| `defineIndicator` / `defineLibrary` / `importLibrary` | 声明指标、声明库、使用库 |

参数就是普通的 `const` 声明，变量名即参数身份——不需要 `inputs`，也没有 `params` 对象：

```js
onBar() {
  const period = input.int(20, { title: '周期', min: 1 })
  const type = input.string('SMA', { options: ['SMA', 'EMA'] })
  plot.Line(type === 'SMA' ? ta.sma(close, period) : ta.ema(close, period), 'ma')
}
```

内置 `ta` 库提供 `sma`、`ema`、`wma`、`vwma`、`rsi`、`highest`、`lowest`、`crossover`、`crossunder`、`rising`、`falling` 与 `change`。用户库使用同一套 `defineLibrary` 调用，进入同一个全局命名空间。

- **沙箱执行** — 脚本在内嵌 QuickJS 运行时中执行，每次运行都有时间和内存预算，跑飞的脚本会失败退出而不是拖垮宿主
- **不接触未来数据** — 历史不足时序列返回 `NaN`，脚本永远无法读取未来
- **真实编辑器** — 图表内置基于 CodeMirror 的脚本编辑器，补全、悬浮签名与参数提示均来自编译器所用的同一份声明
- **同一渲染链路** — Plot 走引擎既有的绘图、坐标轴与图例通道，脚本指标与内置指标行为一致

通过脚本服务注册脚本，注册后即作为普通条目出现在指标选择器中：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService()
await scripts.create(source)
```

完整声明参考见[脚本文档]({{root}}packages/script/docs/indicator.md)，另有[函数库]({{root}}packages/script/docs/library.md)与 [Plot API]({{root}}packages/script/docs/indicator.md#plot)。
