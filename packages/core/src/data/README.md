# data 数据层

`packages/core/src/data/` 是图表引擎的数据层，负责**行情数据的获取、缓冲、与图表渲染层解耦**。它不关心 UI，只面向数据源与图表内部取数需求，向上通过 `controllers` 与 `data/index.ts` 暴露公共接口。

## 目的

图表渲染层需要"窗口内有什么数据"，而不应关心数据从哪来、怎么拉、失败了怎么办。数据层把这些问题收敛到一处：

1. 屏蔽多数据源（gotdx / BaoStock / TradingView / Mock）的协议差异。
2. 通过图表实例级内存缓存统一增量加载与缓存合并，避免滚动与 Agent 重复拉取。
3. 在缓存层统一处理分页、重试、错误和加载状态。
4. 让图表运行时只通过统一 Provider 取数，避免第二套 Fetcher 契约。

## 结构

```
data/
├── index.ts          # 数据层公共出口：re-export 各子模块，副作用注册内置数据源
├── buffer/           # 行情缓存：覆盖策略、分页、重试与图表快照适配
├── depth/            # 深度数据：盘口订单簿（binance SSE + 热力图连接器）
└── provider/         # 统一行情 Provider 体系：注册表、数据源元数据、wire 协议、各源装配
    ├── registry.ts       # MarketDataProviderRegistry：Provider 注册 + 运行时配置（enabled/baseUrl）
    ├── sourceRegistry.ts # dataSourceRegistry：数据源静态元数据（id/displayName/description/defaultBaseUrl）
    ├── types.ts          # 领域模型：InstrumentDescriptor / BarSeries / MarketDataProvider 等
    ├── protocol/         # wire 契约：envelope、HTTP transport、通用 Provider 装配器
    └── sources/          # 各数据源装配：gotdx / baostock / tradingview / mock 的 Provider 实例 + 注册
```

## 各子模块职责

### buffer/ — 数据缓冲层

面向 UI、图表和 Agent 的统一行情缓存。`MarketDataCache` 以 `limit`/`before` 游标直接提供 K 线分页、重试和 in-flight 去重；`DataBuffer` / `TimeShareBuffer` 只将查询结果投影为图表响应式快照。

- `marketDataCache.ts`：统一查询、内存缓存、`limit`/`before` 游标分页、重试与请求去重。
- `dataBuffer.ts` / `timeShareBuffer.ts`：图表数据、loading 和 error 快照适配。
- `marketDataPolicy.ts`：页大小、初始窗口和重试退避策略。
- `kLineDataStore.ts` / `timeKeyIndex.ts`：K 线快照合并与时间轴索引。

UI、Agent 与 `ChartDataManager` 都通过同一 `MarketDataCache` 取数；缓冲对象不接收 fetcher。

### depth/ — 深度数据

盘口订单簿数据，与 K 线/分时无关的独立领域。

- `binance.ts`：Binance SSE 深度源。
- `depthConnector.ts`：连接深度源与热力图渲染的控制器。
- `depthTypes.ts`：深度领域类型。

### provider/ — 统一行情 Provider 体系

前端主导的统一行情模型。数据源适配器把私有协议转换为标准类型，图表与 UI 不解析上游字段（`providerRef` 只由创建它的 Provider 消费）。

- `registry.ts`：Provider 注册表 + 运行时配置（`enabled` / `baseUrl`），聚合源面板写入此处的配置。
- `sourceRegistry.ts`：数据源静态元数据，作为注册表与 UI 展示的单一事实来源。
- `protocol/`：V1 wire 契约 —— `types.ts`（请求/响应类型）、`httpTransport.ts`（HTTP 实现）、`provider.ts`（`createMarketDataProvider` 通用装配器）。
- `sources/`：各数据源 Provider 装配与注册（gotdx / baostock / finshare / tradingview / mock）。mock 为本地生成、不依赖后端。
#### 协议接口

`provider/protocol/` 定义前端唯一的数据接入契约（`MarketDataTransport`），任何后端实现该契约即可接入。HTTP 实现位于 `httpTransport.ts`，请求统一包装为 `ProtocolEnvelope<T>`，失败时返回 `ProtocolErrorEnvelope`。协议名 `market-data-v1`，版本 1。

| Transport 方法 | HTTP 端点 | 方法 | 请求 | 响应 | 作用 |
|---|---|---|---|---|---|
| `probe` | `/api/v1/market-data/sources/{sourceId}/probe` | GET | — | `ProtocolSourceProbe` | 探测数据源可用性（在线/离线/降级） |
| `searchInstruments` | `/api/v1/market-data/instruments/search` | POST | `ProtocolInstrumentSearchRequest` | `ProtocolInstrumentSearchResult` | 按关键词搜索品种目录 |
| `fetchBars` | `/api/v1/market-data/bars` | POST | `ProtocolBarRequest` | `ProtocolBarSeries` | 游标分页拉取指定品种/周期的 K 线 |
| `fetchTimeShare` | `/api/v1/market-data/timeshare` | POST | `ProtocolTimeShareRequest` | `ProtocolTimeShareSeries` | 拉取单个交易日内的分时序列 |

核心载荷类型：

- `ProtocolInstrumentDescriptor`：品种目录描述（含 `capabilities`，声明 bars / timeShare / depth 能力）。
- `ProtocolInstrumentReference`：请求体中的品种身份引用，仅 `id` / `symbol` / `exchange` / `providerRef` 最小字段集。
- `ProtocolBarRequest` / `ProtocolBarSeries`：K 线拉取，`limit` 控制页大小，`before` 为可选的 UTC 毫秒排他游标；不传游标返回最新一页。
- `ProtocolTimeShareRequest` / `ProtocolTimeShareSeries`：分时拉取，按品种时区 `YYYY-MM-DD` 交易日，响应含 `preClose`。

## 取数路径

图表运行时只走 Provider 路径：`ChartDataManager` 通过 `SourceRouter` 选择已注册的 `MarketDataProvider`。聚合源管理 UI 只展示 Provider 注册表。新数据源应实现为 Provider 并注册进 `marketDataProviderRegistry`。

## 公共导出

- `data/index.ts`：数据层总出口，被 `controllers/index.ts` re-export。
- 包级子路径 `@363045841yyt/klinechart-core/market-data`：指向 `provider/index.ts`，供框架绑定包导入领域类型。
