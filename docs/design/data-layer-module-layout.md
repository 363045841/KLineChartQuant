# data 层模块布局：types.ts + impl/

## 背景

仓库约定（AGENTS.md「Semantic module layout」）：有独立职责的功能模块采用 `<module>/types.ts`（对外契约、数据类型、依赖接口）+ `<module>/impl/`（实现）的布局，`<module>/__tests__/` 只用于测试该模块。

`packages/core/src/data/` 此前整层是扁平风格：实现文件直接堆在子模块根目录，且部分对外契约（`MarketDataSourceConfig` / `SourceCapabilityQuery` / `SourceRouter*Request` / `RoutedMarketData`）住在实现文件 `registry.ts` / `router.ts` 里。这与其他模块（`scale/`、`engine/*/`、`features/*/`、`components/*/` 均已使用 `impl/`）不一致。

## 决策

对 data 层统一应用该约定，只做目录与契约归位，不改任何运行时行为：

```
data/
├── index.ts
├── buffer/
│   ├── types.ts                # 原 dataBufferTypes.ts
│   └── impl/                   # marketDataCache / dataBuffer / timeShareBuffer / seriesRepository / ...
├── depth/
│   ├── types.ts                # 原 depthTypes.ts
│   └── impl/                   # binance / depthConnector
├── live/
│   ├── types.ts
│   └── impl/barsLive.ts
└── provider/
    ├── types.ts                # 领域模型 + 注册表 / Router 契约
    ├── index.ts
    ├── impl/                   # registry / router / instrumentSearch / sourceRegistry
    │   └── sources/            # 各数据源装配与注册
    └── protocol/
        ├── types.ts            # wire 契约
        ├── index.ts
        └── impl/               # httpTransport / provider
```

- **契约归位**：`registry.ts` 的 `MarketDataSourceConfig` / `MarketDataSourceConfigPatch` / `SourceCapabilityQuery`，以及 `router.ts` 的 `SourceRouterInstrumentIdentity` / `SourceRouter*Request` / `SourceRouteAttempt` / `RoutedMarketData` 全部移入 `provider/types.ts`；`registry.ts` / `router.ts` 作为实现对契约只读依赖，`types.ts` 不依赖 `impl/`。
- **`*Types.ts` 更名 `types.ts`**：`buffer/dataBufferTypes.ts` → `buffer/types.ts`，`depth/depthTypes.ts` → `depth/types.ts`。
- **protocol 作为子模块**：`protocol/types.ts` 是 wire 契约，`httpTransport.ts` / `provider.ts` 是 wire 实现，后者进入 `protocol/impl/`。

## 公开子路径的处理

`@363045841yyt/klinechart-core/market-data/sources` 与 `.../sources/*` 是已发布的包级子路径。`sources/` 是纯实现，按约定应进入 `impl/sources/`。处理方式：

- **exports 的 key 保持不变**（外部消费者的导入路径不变，不构成破坏性变更）；
- **target 指向新位置** `./dist/data/provider/impl/sources/*`。

`./market-data` 子路径指向 `data/provider/index.ts`（未移动），保持不变。

## 边界

- 只移动位置与契约归属，不改任何函数签名、行为或运行时语义；`index.ts` 的公共导出集合保持不变（并补齐此前遗漏的 `SourceRouterTimeShareRangeRequest`）。
- `sources/` 位于 `impl/` 之下属实现，其稳定契约是包级子路径 key，而非源码目录名。

## 验证

- `pnpm -C packages/core test`：245 文件 / 2645 用例通过。
- `pnpm -C packages/core build` + `publint --strict`：产物与 exports 一致。
- vue / react / angular / agent-runtime 测试通过。
- `biome check packages/core/src/data`：无新增问题。

## 附：错误码收敛

`errors.ts` 已有 `ERROR_CODES`（fetch 族），但流转层与大量模块仍在用字符串字面量。本次一并收敛：

- `ERROR_CODES` 由类型注解改为 `as const satisfies`，保留字面量类型 —— 原注解会把值拓宽为 `KLineChartErrorCode`，导致 `error.code === ERROR_CODES.X` 无法参与类型收窄。
- 新增 `GENERIC_ERROR_CODES`（`INVALID_PARAM` / `INVALID_STATE` / `DISPOSED` / `NOT_REGISTERED`），供入参与生命周期类错误统一引用；`SUBPANE_ERROR_CODES` 的两个值改为引用它。
- fetch 族（`FETCH_FAILED` / `FETCH_ABORTED` / `UNSUPPORTED_CAPABILITY` / `INSTRUMENT_NOT_FOUND`）在 `provider/impl/router.ts`、`provider/protocol/impl/provider.ts`、`provider/impl/instrumentSearch.ts`、`live/impl/barsLive.ts` 改为 `ERROR_CODES.*`。
- 通用码在 17 个生产文件（scale / input / rendering / engine / foundation / data 等）改为 `GENERIC_ERROR_CODES.*`；测试断言保留字面量。

领域族具名常量（`SCALE_ERROR_CODES` / `FOOTPRINT_ERROR_CODES` / `AVWAP_ERROR_CODES` / `INDICATOR_ERROR_CODES` / `HEATMAP_ERROR_CODES` / `MTF_ERROR_CODES` / `CHART_TYPE_ERROR_CODES` / `REPLAY_ERROR_CODES` / `DEPTH_ERROR_CODES`）已补齐，对应调用点全部改为引用常量。

未纳入本次：

- `MarketDataErrorCode`（`errorCode()` 的返回值 `UPSTREAM_UNAVAILABLE` / `ABORTED` / `UNKNOWN` 等）是 data 层独立的领域词汇，不是 `KLineChartError` 码，无对应常量对象。
- `protocol/types.ts` 的 `SOURCE_REJECTION_CODES` 是「可流转错误码集合」的定义本身。
- `errors-help.ts` 的 `HINTS`（`Record<KLineChartErrorCode, string>`）以错误码为键，是「码 → 恢复提示」定义表，且由类型保证完备，保留字面量键。
- 测试断言保留字面量。

## 附：data 层硬编码字符串收敛

审计 `data/` 模块后清除的魔法字符串：

| 位置 | 原字面量 | 改为 |
|------|----------|------|
| `buffer/impl/marketDataCache.ts`、`provider/impl/router.ts` | `'auto'` | `AUTO_SOURCE_ID`（上提到 `provider/types.ts`，避免 provider → buffer 反向依赖） |
| `buffer/impl/marketDataCache.ts` | `'latest'` | `LATEST_TRADING_DATE` |
| `buffer/impl/marketDataCache.ts` | `'exhausted'` | `OLDER_DATA_STATUS.EXHAUSTED` |
| `provider/protocol/impl/httpTransport.ts`、`live/impl/barsLive.ts` | `/api/v1/market-data/...` 端点路径 | `V1_ENDPOINTS.*` |
| `provider/protocol/impl/httpTransport.ts` | `{ 'Content-Type': 'application/json' }` | `JSON_HEADERS` |
| `provider/protocol/impl/provider.ts` | `'CN'` | `CN_SESSION_ID` |

刻意保留：类型化联合的判别值（`'bars'` / `'snapshot'` / `'exhausted'` 之类的内部判别）、wire 协议字段名、数据源注册表数据、mock 夹具、`errors-help` 的码 → 提示表。



