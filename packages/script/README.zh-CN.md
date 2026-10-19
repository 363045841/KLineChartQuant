# @363045841yyt/klinechart-script

面向 KLineChartQuant 的时间序列脚本引擎：确定性执行，与数据源和图表解耦。
一个脚本就是一份 JavaScript 文件，在嵌入式 QuickJS 运行时里执行，宿主能在不暴露页面的前提下运行不受信任的用户脚本。

引擎只编译一次，逐 bar 执行并输出 Plot 绘图点。它不依赖任何图表或数据源：行情由宿主提供，
渲染交给图表适配层。

## 安装

```bash
npm install @363045841yyt/klinechart-script
# 或
pnpm add @363045841yyt/klinechart-script
```

## 脚本结构

一个文件只声明一个指标，同时也是编辑器里展示的源码。元数据、参数和计算都在同一份文档里：

```js
defineIndicator({
  name: 'OC Average',
  position: Position.Sub,
  inputs: {
    n: input(2, { title: '除数' }),
  },
  onBar() {
    plot.Line((open + close) / params.n, 'oc-average')
  },
})
```

VM prelude 在脚本运行前注入以下全局：

| 全局 | 含义 |
| --- | --- |
| `open` `high` `low` `close` `volume` `time` | 行情序列；`close` 取当前 K 线，`close[1]` 取前一根 |
| `params` | 解析后的输入参数 |
| `plot.Line(value, name, options?)` | 为当前 K 线输出绘图点；提供 `Line`、`Histogram`、`Point`、`Shape`、`Char`、`Arrow` 方法 |
| `fill(from, to, color, title, options?)` | 填充两个 Plot 之间的区域；`from` / `to` 是 `plot.*` 返回的句柄 |
| `Position` | 指标注册位置；`Position.Main` 主图或 `Position.Sub` 副图 |
| `input(default, options?)` | 声明一个参数；字符串参数带 `options` 时渲染为下拉 |
| `defineIndicator(definition)` | 声明文件里唯一的指标 |
| `defineLibrary(name, members)` / `importLibrary(name)` | 声明并使用库 |

历史不足时序列返回 `NaN`，永远不会暴露未来的 K 线。数值上下文可直接写序列：`close - open` 等价于 `close[0] - open[0]`；
`ta.sma(close, 20)` 这类要求完整序列的参数位置仍然传入整条序列。

## 执行

运行时基于 WASM，首次异步加载。预加载后使用同步入口——图表的同步计算端口就是这么调用的：

```ts
import { preloadQuickJS, runQuickJSScriptSync, readQuickJSScriptDefinitionSync } from '@363045841yyt/klinechart-script'

await preloadQuickJS()
const definition = readQuickJSScriptDefinitionSync(source) // 只读元数据，不需要行情
const collection = runQuickJSScriptSync({ source, bars, params: { n: 2 } })
// → { plots: [...], fills: [...] }
```

模块未预加载时使用异步入口 `runQuickJSScript`。

两个入口都给每个 Context 设定时间与内存上限，失控脚本会失败而不是挂住宿主。

## 库

库是加载进同一个 VM 的 JavaScript 源码，统一走一套协议：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService([
  { name: 'stats', source: `defineLibrary('stats', { mean: (values) => values[0] })` },
])
```

内置 `ta` 库（`sma`、`ema`、`wma`、`vwma`、`rsi`、`highest`、`lowest`、`crossover`、`crossunder`）使用完全相同的
`defineLibrary` 调用。manifest 见 `builtinLibraries`。

## 契约

| 分组 | 类型 |
| --- | --- |
| 输入 | `Bar`、`DataFeed`、`DataFeedRange` |
| 输出 | `PlotPoint`、`AlertEvent`、`LogEvent`、`OutputSink` |
| QuickJS | `QuickJSRunOptions`、`QuickJSScriptDefinition`、`QuickJSLibrary` |
| 库 | `LibraryModules`、`LibraryExports`、`TechnicalAnalysisLibrary` |
| Plot | `Plot`、`PlotFill`、`PlotCollection` |

Plot 数据模型由 `@363045841yyt/klinechart-plot-contracts` 提供，与图表引擎共用，此处重新导出。

## 命令

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 生成 `dist/` 下的 JS 与类型声明 |
| `pnpm test` | Vitest，Node 环境，无需图形环境 |
| `pnpm lint:publish` | `publint --strict` 包检查 |

## 许可证

[AGPL-3.0-or-later](LICENSE)

本包属于本仓库的 AGPL 岛：可以依赖 Apache-2.0 的包，但任何 Apache-2.0 的包都不得 import 或打包它。对应发布版本的源码见
[KLineChartQuant 仓库](https://github.com/363045841/KLineChartQuant/tree/main/packages/script) 的发布 tag。
