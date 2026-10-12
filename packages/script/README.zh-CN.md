# KLineChart Script

面向 KLineChartQuant 的时间序列脚本引擎：确定性执行，与数据源和渲染解耦。
脚本直接用 TypeScript 编写，因此天然具备类型系统、调试器与 npm 生态。

> 脚手架阶段。目前只定义了输入 / 输出契约，执行器和脚本外壳尚未实现。

## 输入契约

```ts
import type { Bar, DataFeed, DataFeedRange } from '@363045841yyt/klinechart-script'
```

| 类型 | 说明 |
| --- | --- |
| `Bar` | 单根 K 线，`time` 为毫秒 UTC 时间戳 |
| `DataFeedRange` | 历史请求时间范围，缺省表示不限制 |
| `DataFeed` | `history()` 提供历史 K 线，`subscribe()` 订阅实时 tick |

## 输出契约

```ts
import type { AlertEvent, LogEvent, OutputSink, PlotPoint } from '@363045841yyt/klinechart-script'
```

| 类型 | 说明 |
| --- | --- |
| `PlotPoint` | 单个绘图点，`value` 为 `NaN` 表示 `na` |
| `AlertEvent` | 告警事件，由 `alert()` 或 `alertcondition()` 产生 |
| `LogEvent` | 日志事件 |
| `OutputSink` | `onPlot()` 接收绘图点，`onEvent()` 接收事件 |

## 命令

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 生成 `dist/` 下的 JS 与类型声明 |
| `pnpm test` | Vitest，Node 环境，无需图形环境 |
| `pnpm lint:publish` | `publint --strict` 包检查 |
