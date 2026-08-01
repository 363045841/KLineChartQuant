## 📡 Data Sources

KLineChart requires a market data backend. Supported data sources:

| Data Source | Description | Docs |
|---|---|---|
| `gotdx` | Tongdaxin (GOTDX) quotes: A-share / futures / MAC, served by `KlineChartQuantGo` | [KlineChartQuantGo]({{root}}docs/data-sources/klinechartquantgo.zh-CN.md) |
| `baostock` | BaoStock A-share daily / weekly / monthly & minute K-lines, served by `stockbao` | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView global instruments, served by `stockbao` | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `mock` | Debug only: local MOCK-100 / MOCK-10000 K-lines, no backend needed, always online | — |

Backend repos live alongside this one (outside the monorepo). See each doc above for the specific startup steps.
