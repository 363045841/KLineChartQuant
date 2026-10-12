# @363045841yyt/klinechart-script

面向 KLineChartQuant 的时间序列脚本引擎：确定性执行，与数据源和图表解耦。
脚本直接用 TypeScript 编写，因此天然具备类型系统、调试器与 npm 生态。

引擎逐 bar 执行并输出 Plot 绘图点。它不依赖任何图表或数据源：行情由宿主提供，
渲染交给图表适配层。

## 安装

```bash
npm install @363045841yyt/klinechart-script
# 或
pnpm add @363045841yyt/klinechart-script
```

## 快速开始

声明一个指标：`name` 是指标身份，`inputs` 声明参数，`onBar` 每根 K 线执行一次。

```ts
import { defineIndicator, input } from '@363045841yyt/klinechart-script'

export const openCloseAverage = defineIndicator({
  name: 'OC Average',
  pane: 'main',
  inputs: { n: input(2, '除数') },
  onBar(ctx, params) {
    ctx.plot((ctx.open + ctx.close) / params.n, { id: 'oc-average' })
  },
})
```

宿主在启动时调用一次 `registerDefinedScripts()`，之后每次声明都会自动进入图表指标目录：

```ts
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
import '@363045841yyt/klinechart-script/indicators'

registerDefinedScripts()
```

## 使用

用宿主已有的行情执行脚本，收集完整 Plot：

```ts
import { executeScript } from '@363045841yyt/klinechart-script'

const collection = executeScript(openCloseAverage, bars)
// → { plots: [...], fills: [...] }
```

第三个参数可覆盖脚本的默认输入，仅对本次执行生效。
若行情来自数据源，改用 `runEngine` 流式执行，结果转发给 `OutputSink`：

```ts
import { runEngine } from '@363045841yyt/klinechart-script'

await runEngine({ script: openCloseAverage, feed, sink, symbol: 'BTCUSDT', tf: '1h' })
```

## 契约

| 分组 | 类型 |
| --- | --- |
| 输入 | `Bar`、`DataFeed`、`DataFeedRange` |
| 输出 | `PlotPoint`、`AlertEvent`、`LogEvent`、`OutputSink` |
| 脚本 | `IndicatorDef`、`Ctx`、`InputSchema`、`PlotDeclaration`、`PlotFillDeclaration` |
| Plot | `Plot`、`PlotFill`、`PlotCollection` |

Plot 数据模型由 `@363045841yyt/klinechart-plot-contracts` 提供，与图表引擎共用，此处重新导出。

## 文档

- [`docs/indicator.md`](./docs/indicator.md)——如何编写指标脚本
- [`docs/strategy.md`](./docs/strategy.md)——规划中
- [`docs/library.md`](./docs/library.md)——规划中

## 命令

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 生成 `dist/` 下的 JS 与类型声明 |
| `pnpm test` | Vitest，Node 环境，无需图形环境 |
| `pnpm lint:publish` | `publint --strict` 包检查 |
