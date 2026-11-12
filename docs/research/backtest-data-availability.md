# KCQ 侧回测数据可得性核查

> 目标：为决策票 #9（机会单 + 回测）提供事实依据。
> 方法：以读代码为主，辅以本机实测（Binance connector 8091 在线、MT5 connector 8090 在线；GoTDX 8080、THS 8092 未运行）。
> 写作时间：2026-11-09。
> 本文严格区分「实测 / 代码事实 / 推断」。未实测项显式标注。

---

## 一句话结论

**K 线能覆盖到标的上市首日、且可分页拉全；逐笔成交只覆盖「当日实时分页」和「需外网归档的历史」两条路，历史归档在本机当前网络下不可用；期权链在 KCQ 侧完全不存在（Deribit 也未接入）。**
所以本期回测的可重放范围是：**日线/分钟 K 线全历史 + 当日逐笔**；**不能重放历史 footprint，也不能重放任何期权链快照**。

---

## 分项事实表

### 1. K 线

| 项 | 值 | 依据 |
| --- | --- | --- |
| Connector 单次 `limit` 上限 | **1000**（1–1000，超出返回 `INVALID_REQUEST`） | 实测 `limit=1000` 返回 1000 根；`limit=1001` 返回 `{"code":"INVALID_REQUEST","message":"limit 必须为 1–1000..."}`；源码 `../Binance-Connector/internal/server/server.go:303` |
| Agent 工具层 `limit` 上限 | **798**（`MARKET_BARS_QUERY_MAX_LIMIT`，注释写明「GoTDX V1 /bars 接口单页最大返回条数」） | 代码 `packages/core/src/features/agent/impl/chartAgentController.ts:62`、`:86` |
| 缓存层默认页大小 | **500**（`DEFAULT_BAR_PAGE_LIMIT`） | 代码 `packages/core/src/data/buffer/impl/marketDataPolicy.ts:13` |
| 是否分页 | **是**。游标为排他上界 `beforeTimestamp`，按「根数」拉取，不按时间范围外推 | 协议 `packages/core/src/data/provider/protocol/types.ts:136-144`；`marketDataCache.ts:747`（`fetchPage` 只请求一页） |
| `olderData` 语义 | `unknown` / `exhausted`（后端声明）。实测**有数据时也返回 `unknown`**，只有空页才返回 `exhausted` | 实测：`beforeTimestamp=1504224000000` 返回 2 根且 `olderData=unknown`；`beforeTimestamp=1502928000000` 返回 `items:[]` + `olderData=exhausted` |
| 现货 BTCUSDT 最早日线 | **2017-08-17**（`1502928000000`，单根） | 实测 |
| 现货 BTCUSDT 1min 最早 | 与日线同期，**2017-08** 起可查；在 `1502928000000` 之前为空 | 实测：`beforeTimestamp=1504224000000`（2017-09-01）有 1min 数据；`beforeTimestamp=1502928000000` 为空 |
| 永续 BTCUSDT 最早 | **2019-09 内上线**：`2019-09-01` 前为空，`2020-01-01` 有数据 | 实测（未逐日定位确切上线日） |
| 单次可取时间跨度 | 受 `limit` 与周期共同决定，非固定时长。例：1min×1000 = 16.7 小时；daily×1000 = 2.7 年 | 计算 |
| 全历史拉取成本（spot 1min，2017-08→2026-11） | ≈ **485 万根** → ≈ **4856 次请求** → 按现货 klines 权重 2/次 共 9712 权重 → 1200 权重/分钟预算下**理论下限约 8 分钟** | 推断。依据：`klinesWeight` 现货固定 2（`market.go:156-170`）、`BINANCE_WEIGHT_PER_MINUTE=1200`（README） |
| 数据源声明 `maxBarsPerRequest` | Binance connector **未声明**该字段（probe 的 `capabilities.bars` 只有 `periods/adjustments/barAggregations`），因此 `provider.ts:215` 的钳制逻辑对该源不生效，只有服务端 1000 的硬校验 | 实测 probe + 代码 `provider.ts:211-218` |
| 支持的周期 | `1min/5min/15min/30min/60min/4h/daily/weekly/monthly` | 实测 probe |
| 复权 | 仅 `none`；聚合方式仅 `original` | 实测 probe；超出返回 `UNSUPPORTED_CAPABILITY` |

**关键约束（代码事实）**：Agent 侧 `BarsQueryInput` **没有 `beforeTimestamp` 字段**（`packages/core/src/features/agent/types.ts:124-134`），`market_bars_query` 工具的描述也写明「Fetch the latest page」。
即：**Agent/工具调用面只能拿到「最新一页」≤798 根，无法自行向历史翻页**。翻页能力只存在于 `MarketDataCache.queryBars` 和图表内部的 `loadBars`。

### 2. 逐笔成交（footprint 原料）

| 项 | 值 | 依据 |
| --- | --- | --- |
| 是否有实时流 | **有**。SSE `/sources/binance/trades/stream?market=&symbol=&kind=aggregated` | README 接口表；`tradeSource.ts:51-60`（`buildTradeStreamUrl`，固定 `kind=aggregated`） |
| 是否有历史存档 | **有两套**：① 当日 `aggTrades` REST 分页；② 往日 `data.binance.vision` 日归档 zip | `range.go:29-101` |
| 单次范围查询上限 | **最多 7 天、250000 笔、250 页**，超出明确报错 | `server.go:427`（7 天）、`range.go:13-14`（250000 笔 / 250 页）；实测超 7 天返回 `INVALID_REQUEST` |
| 分页粒度（前端侧） | **60 秒/页**（`TRADE_HISTORY_PAGE_MS = 60_000`） | `packages/core/src/data/trades/impl/tradeRanges.ts:4` |
| 当日实测 | **可用**。`from=1794214800000,to=1794215100000`（今日 UTC 09:00–09:05）返回 `complete:true` + 逐笔 | 实测 |
| 历史归档实测 | **不可用**。2021-06-01 / 2024-01-02 / 2024-02-01 / 2025-03-03 / 2026-10-01 / 2026-11-07 全部返回 `{"code":"ARCHIVE_UNAVAILABLE","message":"历史文件尚未发布或不存在，HTTP 404"}` | 实测（共 7 个日期，spot 与 perp 均失败） |
| 归档不可用的根因 | 本机无法访问归档域名：`data.binance.vision` 直连失败（curl 退出码 35/000），代理 `127.0.0.1:6666`（connector 默认）与 `127.0.0.1:7078` 均无响应 | 实测。**这是环境问题，不是 connector 缺陷**——代码路径与格式解析均存在且有单测 |
| 原始逐笔的深度回补 | 现货需 `api.binance.com` 的 `historicalTrades`（需代理/可能需 Key）；永续**不支持**按 ID 回补原始成交 | README「未完成」段；`market.go:90-98` 显式拒绝 |
| 内存保留范围 | 只保留当前视口需求范围；`retain(range)` 会丢弃范围外成交。批次达 128 时压缩为单批 | `tradeBuffer.ts:40`（128 批压缩）、`tradeBuffer.ts:149-173`（`retain`） |
| 能否回放历史 | **能回放的程度 = 当日（实时起点起）+ 归档可得时的往日**。归档不可得的往日**无法回放** | 综合 |

**关键约束**：footprint 是**由 `TradeSnapshot` 在 worker 内计算的派生结果**，不落盘（`components/footprint/runtime/types.ts:7-12`、`FootprintWorkerRequest`）。
因此「回放 footprint」等价于「回放逐笔成交」——没有独立的 footprint 存档。

### 3. 期权链

| 项 | 事实 | 依据 |
| --- | --- | --- |
| KCQ 侧是否有期权链 provider | **没有**。全仓（`packages/**`，源码与 dist）搜索 `deribit` **零命中**；`DataSource` 枚举只有 binance/gotdx/baostock/tradingview/mt5/ths/mock | grep 实测 + `packages/plot-contracts/src/market.ts:12-28` |
| KCQ 侧是否有 IV / OI / 期权链数据结构 | **没有**。`InstrumentType` 有 `option`，但仅表示「品种类别」，没有期权链、IV、OI 的数据契约 | `provider/types.ts:16-24` |
| THS 是否提供期权 | 提供期权**日线**（如 `10011425.SH`），但只有 K 线，没有链/IV/OI | `docs/data-sources/ths.zh-CN.md` |
| Deribit 是否有历史 DVOL | **有**，日线可回溯到 **2021-03-24**（实测：`1615939200000→1616544000000` 只返回 `1616544000000`；更早区间返回空数组） | 实测 `public/get_volatility_index_data` |
| DVOL 接口分页 | `start_timestamp`/`end_timestamp` 窗口 + `continuation` 游标。单次最多 1000 条 | 实测：一次拉 2021→今 返回 `continuation:1707782400000`；官方文档「count 上限 1000」 |
| DVOL 支持的分辨率 | 实测 `resolution=1D`、`60`（分钟）、`3600` 均可用 | 实测 |
| Deribit 是否有**历史 OI 序列** | **没有**。`get_book_summary_by_currency` 只返回**当前**快照（含 `open_interest`/`mark_iv`），官方文档未提供历史 OI 端点 | 实测：返回实时快照（`creation_timestamp` 为当下）；文档接口清单无 OI 历史 |
| Deribit 是否有**历史单合约 IV 序列** | **没有直接端点**。历史成交 `get_last_trades_by_instrument_and_time` 的每条成交**带 `iv`、`mark_price`、`index_price`**，是唯一可得的历史 IV 观测，但只在有成交时才有值 | 实测返回字段含 `iv:43.7`；官方文档「Historical and realized/implied volatility」段只列 `get_historical_volatility`（已实现波动率）与 DVOL |
| Deribit 是否有已实现波动率历史 | 有 `public/get_historical_volatility`，但实测**只返回最近约 40 小时**的分钟级点（首条 `1792864800000`），不是长历史 | 实测 |
| 期权链快照如何获得 | 只能 **实时采集**：`markprice.options.{index_name}`（全链 mark price+IV）或 `get_book_summary_by_currency`（周期快照）。想回测必须有自建存档 | 官方 `docs.deribit.com/articles/options-data-collection-best-practices` |

**结论**：期权链历史**在 KCQ 侧为 0，在 Deribit 侧也需要自建存档**。若回测要含期权，必须先做一个期权链采集器并开始积累。

### 4. MarketDataCache 边界

| 项 | 值 | 依据 |
| --- | --- | --- |
| 默认内存上限 | **50 MiB / 图表实例**（`DEFAULT_MARKET_DATA_CACHE_MAX_BYTES = 50 * 1024 * 1024`） | `marketDataPolicy.ts:9` |
| 可配置范围 | **5–512 MiB**（超出被钳制） | `marketDataPolicy.ts:10-11`、`resolveMarketDataCacheMaxBytes` |
| 字节估算方式 | `JSON.stringify(value).length * 4`，下限 1024 B | `marketDataCache.ts:247-254` |
| 容量共享 | K 线、分时、多日分时、逐笔**共用一个 LRU 条目表**（`entries: Map<string, CacheEntryMetadata>`），跨类别统一预算 | `marketDataCache.ts:128-131`、`:277` |
| 淘汰策略 | **LRU**。写后调用 `evictToLimit`，淘汰最久未访问的**其他**条目；刚写入的单项允许暂时超限以保证本次查询能返回 | `marketDataCache.ts:874-890` |
| 逐笔淘汰的副作用 | 淘汰逐笔条目会执行 `removeTradeEntry(key, true)` → `buffer.clear()`，即**成交数据被清空**（保留实例身份） | `marketDataCache.ts:880-882` |
| 逐笔超预算时 | 先尝试 `retain(当前需求范围)` 回收屏外数据；仍超预算则抛 `TRADE_MESSAGES.capacityExceeded`（"当前成交需求超过行情缓存预算，请缩小范围"） | `marketDataCache.ts:399-407` |
| 是否持久化 | **否**。纯内存（`Map` + signal），无 IndexedDB / localStorage / 文件写入；`destroy()` 直接清空 | 全仓 grep：数据层无 `indexedDB|localStorage|persist` 命中；IndexedDB 只出现在 `packages/agent-runtime/src/sessions/`（会话存储，与行情无关） |
| 生命周期 | 绑定图表实例；`clear()` 中止在途请求并清空全部数据 | `marketDataCache.ts:640-654` |
| 缓存命中判定 | `coversPage`：无游标时要求 `data.length >= limit`；有游标时要求游标前根数 ≥ limit；`olderData === exhausted` 时任何游标都直接命中 | `marketDataCache.ts:735-745` |
| 分页并发控制 | 同一 key 只允许一个覆盖请求在跑（`pending: Map<string, Promise<void>>`），等待后重新判定 | `marketDataCache.ts:692-711` |

**量级对照（推断）**：一根 1min K 线序列化约 150 B，按 ×4 估算约 600 B/根；默认 50 MiB 约可容纳 **8.7 万根**（≈ 60 天 1min，或 240 年日线）。全历史 1min 485 万根按同法约需 **2.9 GB**，**超出默认上限 58 倍、超出最大可选上限（512 MiB）5.7 倍**。
→ 结论：**回测不可能靠 `MarketDataCache` 承载全历史，必须落盘或分段流式**。

### 5. MT5 / THS 边界

| 项 | 事实 | 依据 |
| --- | --- | --- |
| MT5 是否参与本期回测 | **不参与**（与预期一致） | 见下 |
| MT5 实测状态 | 本机 `127.0.0.1:8090` **在线**，probe 返回 `status:online`，支持 `1min…monthly`、`liveBars:true`、`tradingCalendar:true` | 实测 probe |
| MT5 能力缺口 | probe 的 `capabilities` **没有 `trades` / `depth` / `timeShare`**，即**无逐笔、无盘口**。声称 `option` 品种类型，但那只是标的存在性，无期权链 | 实测 probe |
| MT5 实测 K 线 | `EURUSD 1min limit=3` 返回 3 根（`timezone:UTC`） | 实测 |
| MT5 边界结论 | 能提供 K 线（含分钟级），**可作为「外汇/CFD K 线」的补充源**；但无逐笔 → 不能产出 footprint；且依赖 Windows 本机已登录终端，不进 `-c all`，不适合做回测基础设施 | 综合 |
| THS 是否参与本期回测 | **不参与**（与预期一致） | 见下 |
| THS 实测状态 | `8092` **未运行**（连接失败），**未实测** | 实测端口探测 |
| THS 能力（文档事实） | **仅 `daily` 一个周期**。分钟线与分时「未开放外部接入」（上游 `code=2004`），这是上游硬约束不是实现取舍 | `docs/data-sources/ths.zh-CN.md:7-9` |
| THS 覆盖 | A 股/指数/ETF/期货/期权，但**只有日线**，无逐笔、无链 | 同上 |
| THS 边界结论 | 只能为 A 股/期货**日线**回测供数。日线粒度下 footprint 无意义 | 综合 |

---

## 缺口清单与需要额外积累的数据

按「能否靠现有 connector 补齐」分类。

### A. 能补齐（改配置/换网络即可，无需写新采集器）

1. **Binance 历史逐笔归档**——当前唯一断点是外网可达性。归档 URL 与解析代码都在，只要 `data.binance.vision` 可达（或给 connector 配上可用代理），往日逐笔即可用。
   - 验证方式：`curl -I https://data.binance.vision/data/spot/daily/aggTrades/BTCUSDT/BTCUSDT-2024-01-02.zip` 返回 200。
   - 风险：单日归档为整日 CSV（zip ≤ 1 GiB、解压 ≤ 8 GiB），全历史逐笔体量极大，**不适合放进回测主循环**，只适合按需切片。
2. **Binance 全历史 K 线**——已经可拉，只是 Agent 工具面拿不到翻页。需要把 `beforeTimestamp` 暴露到工具/服务层，或由回测引擎直接调 `MarketDataCache.queryBars`。

### B. 必须新建采集器并开始积累（无法回溯）

3. **期权链快照（含 IV / OI / greeks）**——Deribit 只给实时流与当前快照，没有历史链。必须在固定频率（建议 1min 或 5min）落盘 `markprice.options.BTC` / `markprice.options.ETH`，以及每日期权合约清单（`get_instruments`）。
   - **从开始采集之日起才有数据**，过去的时间永久缺失。这是本清单里最不可逆的一项。
4. **历史 OI 序列**——同上，Deribit 无端点，只能靠第 3 项的采集顺带获得。
5. **DVOL 之外的波动率曲面**——DVOL 只有指数级单值（2021-03-24 起），不足以支撑按行权价/到期日的曲面回测。曲面只能靠第 3 项的采集自建。

### C. 结构性缺口（需改设计，不是补数据）

6. **Agent 工具面无法翻页**：`market_bars_query` 只能取最新 ≤798 根，`BarsQueryInput` 无 `beforeTimestamp`。若「机会单」要由 Agent 自主取历史片段做判断，这条必须先打通。
7. **逐笔保留范围绑定视口**：`updateTradeDemand` 只按当前可见区间查询（`marketRuntime.ts:453-467`），且 `retain()` 会丢弃屏外数据。回测需要「整段区间常驻」，与现设计相反。
8. **缓存不持久化**：进程结束即丢。回测需要独立的存储层，不能复用 `MarketDataCache` 作为数据源。

---

## 对回测引擎形态的约束

### 结论：**必须落盘，不能内存回放**

三条独立理由（任一成立即足够）：

1. **容量**：全历史 1min 约 2.9 GB（按 `estimateBytes` 口径），超出缓存最大可选上限 512 MiB 的 5.7 倍。
2. **淘汰策略**：`MarketDataCache` 是 LRU，逐笔条目被淘汰时会 `clear()` 数据。回测跑长区间时，早期数据会被静默丢弃，导致「重放中途数据消失」。
3. **生命周期**：无持久化，`destroy()` 即清空。回测的「同一份数据多次重跑」诉求与实例级缓存直接冲突。

### 可行的形态约束（按数据分层）

| 数据 | 建议形态 | 理由 |
| --- | --- | --- |
| K 线 | **落盘列式文件**（Parquet/Arrow 或按 symbol+period 分片的定长二进制），按区间读入内存窗口 | 体量大、结构固定、需随机区间访问 |
| 逐笔 | **落盘列式文件 + 按天分片**，回测时按需加载 1–N 天 | 归档本身按天发布，天然按天分片；单日 CSV 可达 GiB 级 |
| 期权链 | **落盘时序快照**，按「日期 + 到期 + 行权价」索引 | 需按时间点取整链，稀疏且高维 |
| footprint | **不落盘**，回测时由逐笔即时计算 | 已是 worker 内派生结果，落盘会引入双份真相 |

### 对现有代码的可复用边界

- **可复用**：`Binance connector` 的 `/bars`（游标翻页）与 `/trades/range`（有界完整覆盖）已经是正确的取数原语，回测引擎可以直接当 HTTP 客户端用，**不必经过 `MarketDataCache`**。
- **不可复用**：`MarketDataCache` 的预算/LRU/视口需求模型。它是为「交互式图表」设计的，不是为「批量重放」设计的。硬套会出现三类问题：被淘汰、被 `retain` 裁剪、被 50 MiB 卡死。
- **需要新增**：独立的数据仓库读取层（不依赖图表实例）、区间常驻的逐笔缓冲、以及期权链采集器。

### 建议的回测最小可行数据面

只做 **K 线 + 当日/归档逐笔** 的第一版，可以这样定界：

- 标的：`binance:spot:*` / `binance:perp:*`
- 周期：`1min` 及以上
- 逐笔：仅在有可用归档网络时启用 footprint 重放；否则第一版 footprint 明确标注为「不支持历史重放」
- 期权：**不在第一版范围**，先起采集器攒数据

---

## 附：实测记录

| # | 操作 | 结果 |
| --- | --- | --- |
| 1 | `GET 127.0.0.1:8091/health` | 200，`markets:[spot,perp]` |
| 2 | `GET /sources/binance/probe?market=spot` | `status:online`，capabilities 见上表 |
| 3 | `POST /bars` daily limit=3 | 返回最近 3 根日线（`olderData:unknown`） |
| 4 | `POST /bars` daily `beforeTimestamp=1503000000000` | 返回 1 根（`1502928000000`，2017-08-17） |
| 5 | `POST /bars` 1min `beforeTimestamp=1502928000000` | `items:[]` + `olderData:exhausted` |
| 6 | `POST /bars` 1min `beforeTimestamp=1504224000000` / `1514764800000` | 均有数据（2017-09 / 2018-01 可查） |
| 7 | `POST /bars` limit=1000 | 返回 1000 根 |
| 8 | `POST /bars` limit=1001 | `INVALID_REQUEST`（1–1000） |
| 9 | `POST /bars` perp 1min `beforeTimestamp=1567296000000`（2019-09-01） | `items:[]` + `exhausted` |
| 10 | `POST /bars` perp 1min `beforeTimestamp=1577836800000`（2020-01-01） | 有数据 |
| 11 | `POST /trades/range` 今日 UTC 09:00–09:05 | `complete:true`，返回逐笔 |
| 12 | `POST /trades/range` 跨 11.6 天 | `INVALID_REQUEST`（最多七天） |
| 13 | `POST /trades/range` 2019-01-01 / 2020-10-01 / 2021-06-01 / 2024-01-02 / 2024-02-01 / 2025-03-03 / 2026-10-01 | 全部 `ARCHIVE_UNAVAILABLE` HTTP 404 |
| 14 | `GET /sources/binance/trades/archive?date=2024-01-02` | 同上 404 |
| 15 | `curl -I data.binance.vision/...2026-11-07.zip` | 连接失败（退出码 35 / 000） |
| 16 | `curl -x 6666` / `-x 7078` 访问归档域名 | 均 000，代理不可用 |
| 17 | `GET 127.0.0.1:8090/api/v1/market-data/sources/mt5/probe` | `status:online`，无 `trades` 能力 |
| 18 | `POST 8090 /bars` EURUSD 1min limit=3 | 返回 3 根 |
| 19 | `GET 127.0.0.1:8092/health` | 连接失败（THS 未运行，**未实测**） |
| 20 | `GET 127.0.0.1:8080/health` | 连接失败（GoTDX 未运行，**未实测**） |
| 21 | Deribit `get_volatility_index_data` 2021-03-24 前 | 空数组 |
| 22 | Deribit `get_volatility_index_data` 2021-03-24 起 | 有数据（首条 `1616544000000`） |
| 23 | Deribit `get_volatility_index_data` 2021→今（1D） | 返回 + `continuation:1707782400000`（分页有效） |
| 24 | Deribit `get_volatility_index_data` 2019/2020 区间 | 空数组（DVOL 未发布） |
| 25 | Deribit `get_historical_volatility` BTC | 只返回最近约 40 小时分钟级点 |
| 26 | Deribit `get_book_summary_by_currency?kind=option` | 返回**当前**全链快照（含 `open_interest`/`mark_iv`），无历史 |
| 27 | Deribit `get_last_trades_by_instrument` | 逐笔带 `iv` / `mark_price` / `index_price` |
| 28 | Deribit `get_last_trades_by_instrument_and_time` 2021 区间 | `trades:[]`（该合约当时未上市，属正常） |

> 说明：Deribit 相关请求经工具代理发起（本机 curl 无法直连 deribit.com，实测退出码 000）。因此 Deribit 项标注为「接口实测」而非「本机网络实测」。

## 附：未实测项

1. **THS 的实际 K 线深度与 `limit` 上限**——服务未运行。
2. **GoTDX 的 K 线深度与 `limit` 上限**——服务未运行。代码里 798 这个常量的注释指向 GoTDX，但本机无法验证其真实单页上限。
3. **Binance 归档在可达网络下的真实行为**——只验证了 404 分支，未验证成功分支（代码有单测覆盖 ZIP/CSV/SHA256 校验，但那是合成数据）。
4. **MT5 各周期的历史深度**——只验证了「能返回最新 3 根」，未探测最早可回溯点。
5. **逐笔归档的实际体量与读取耗时**——归档不可达，无法测量。
