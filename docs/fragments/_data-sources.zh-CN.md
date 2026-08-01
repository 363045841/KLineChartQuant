## 📡 数据源

KLineChart 需要行情数据后端支持。支持的数据源如下：

| 数据源 | 说明 | 文档 |
|---|---|---|
| `gotdx` | 通达信（GOTDX）行情：A 股 / 期货 / MAC，由 `KlineChartQuantGo` 提供 | [KlineChartQuantGo]({{root}}docs/data-sources/klinechartquantgo.zh-CN.md) |
| `baostock` | BaoStock A 股日 / 周 / 月及分钟 K 线，由 `stockbao` 提供 | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView 全球品种，由 `stockbao` 提供 | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `mock` | 调试用：本地生成 MOCK-100 / MOCK-10000 K 线，无需后端，探测恒为在线 | — |

后端仓库与本仓库同级（不在 monorepo 内），具体启动方式见各文档。
