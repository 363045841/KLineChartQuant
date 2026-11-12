# 订单流面板的设计决策（2026-11-11）

## 为什么做这块面板

目标是**降低盯盘认知负荷**，不是生成交易信号。

这两件事的价值判断完全不同：
- 作为信号源，它已被证伪（见 `orderflow-stage0.md`：三条组合去重后 12h/24h 失效、胜率不动、跨品种不成立、七年只有 2022 显著）。
- 作为观察工具，它的价值取决于「把七个互相矛盾的面板压缩成一句话」的能力——这是人脑不擅长、机器擅长的部分。

交易员看面板时不是看数字本身，而是看**数字与记忆中的新闻、情绪、走势的关系**。这部分 AI 没有，所以 AI 只负责摆事实、指出矛盾，不做结论。

## 三条硬性数据约束（实测）

### 1. 单次深度请求到不了 ±5%

| 交易所 | 请求档数 | 实测覆盖 |
| --- | ---: | --- |
| Binance 永续 | 1000 | −0.17% / +0.18% |
| Binance 现货 | 5000 | −1.32% / +1.72% |
| OKX 永续 | 400 | ±0.07% |
| Bybit 永续 | 200 | −0.04% / +0.04% |
| Bitget 永续 | 默认（实测 100 档） | −0.02% / +0.03% |
| Hyperliquid | 20（接口固定） | ±0.03% |

文章说的「±5% 深度约 1.9B」是聚合商用多所合并 + 成交量反推算的，公开 API 直接拿不到。

**因此面板的口径定为「实际覆盖范围内的深度」**，每个区间都带 `complete` 标记；覆盖不足时如实显示覆盖率，不假装统计了 ±2%。

### 2. 数量单位各所不同

| 交易所 | 单位 | 换算 |
| --- | --- | --- |
| Binance 永续 | 基础币 | ×1 |
| **OKX 永续** | **合约张数** | **× `ctVal`**（BTC 一张 = 0.01 BTC，ETH 一张 = 0.1 ETH） |
| Bybit 线性 | 基础币 | ×1 |
| Bitget USDT 永续 | 基础币 | ×1 |
| Hyperliquid | 基础币 | ×1 |

OKX 漏乘 `ctVal` 会让它的深度**放大 100 倍**，而分场所净流正是靠横向比较得出的。`ctVal` 不在代码里硬编码，采集时从 `GET /api/v5/public/instruments` 读取并缓存——交易所会调整面值，写死会静默过期。

实测验证（2026-11-11 23:19Z，BTCUSDT，±0.5% 深度总额）：

```
binance      $90.0M   1000 档
okx          $35.7M    400 档
bybit        $20.9M    200 档
hyperliquid   $8.1M     20 档
bitget        $6.4M    100 档
```

同一数量级、排序符合「Binance 最大」的常识，说明换算正确。若 OKX 算错，这一行会变成 $3,570M。

### 3. 深度没有历史，只有当下

实时接口只给当前快照；Binance 的 `metrics` 日包含 OI 与多空比，**但不含深度**。所以：
- 深度的「分位数」需要自己采集累积（首次上线时没有任何历史可对比）
- 面板初期只能显示绝对值与跨所对比，不能显示「处于 90 天第 X 百分位」

## 设计口径

### 按价格区间统计，不按档数

各所档数上限不同（1000 / 400 / 200 / 100 / 20），「前 N 档合计」不可比。统一换算成「距中间价 ±X% 内的名义金额」。区间取 `±0.5% / ±1% / ±2%`，每档都带 `complete`。

### 同时给全深度与近端两个口径

文章的背离判断是「全深度买盘多、近端挂单卖盘多 → 买单挂在远处」。缺任一侧都无法判断，因此：
- `bands[band].imbalance`：全深度失衡
- `nearImbalance`：最优 10 档失衡

`detectDepthDivergence()` 在两者方向相反且各自超过 5% 时给出背离方向，避免把噪声当信号。

### 价格墙用相对阈值

固定金额阈值会让大所永远有墙、小所永远没有。改成「单档名义金额 ≥ 本侧档位中位数 × 8」。用中位数而非均值——墙本身会把均值拉高，导致它自己不达标。

## 已实现

| 文件 | 内容 |
| --- | --- |
| `packages/analytics/src/orderflow/types.ts` | 契约：`DepthSnapshot` / `FlowStats` / `LargeOrderProfile` / `PositioningStats` / `VenueSnapshot` / `OrderflowPanel` / `Contradiction` |
| `orderflow/impl/units.ts` | `toBaseSize` / `notionalOf`：单位换算，拒绝负数与非法面值 |
| `orderflow/impl/depth.ts` | `buildDepthSnapshot` / `imbalanceAt` / `detectDepthDivergence` |
| `orderflow/impl/depthVenues.ts` | 五家深度适配器 + `instrumentIdFor` |
| `orderflow/impl/flowVenues.ts` | 五家主动买卖 + 大单分层 |
| `orderflow/impl/positioningVenues.ts` | 五家持仓结构 |
| `orderflow/impl/panel.ts` | 面板装配、跨所合计、四类矛盾识别 |
| `orderflow/impl/render.ts` | 六面板文本渲染 |
| `net/types.ts` + `nodeHttpsClient.ts` | 新增 `postJson`（Hyperliquid 的查询也走 POST） |
| `src/__tests__/orderflow-*.test.ts` | 29 例 |

回归：`cd packages/analytics && npx vitest run` → 80 例通过；`vue-tsc -p tsconfig.app.json` 与 `-p tsconfig.vitest.json` 均 exit 0。

## 成交数据的粒度差异（这条最容易被误读）

| 交易所 | 来源 | 粒度 | 可覆盖周期 |
| --- | --- | --- | --- |
| Binance | `fapi/v1/klines` 第 7/10 字段 | **官方聚合** | 1m / 5m / 15m / 1h |
| OKX | `rubik/stat/taker-volume`（`[ts, 卖, 买]`） | **官方聚合** | 1H（本项目只取 1h） |
| Bybit | `v5/market/recent-trade` | 最近若干笔 | 实测 26–54 秒 |
| Bitget | `v2/mix/market/fills` | 最近若干笔 | 实测 8–19 秒 |
| Hyperliquid | `info {type:"recentTrades"}` | 最近若干笔 | 实测 1–2 秒 |

**大单分层因此不是小时级统计。** 文章说「1H 成交里 $100K–500K 占 25%」，而这里 1000 笔逐笔只能覆盖 25–50 秒。实测两边量级接近（Binance 单日 $100K–500K 占 33.9%、≥$500K 占 17.1%），但那是巧合，不能拿秒级快照去对文章的 1 小时数字。

面板在渲染时对 `spanMs < 300 秒` 的所直接标注「⚠ 仅代表这几十秒，非小时级分布」。要做真正的小时级分层，必须落盘累积逐笔成交。

## 持仓：两类多空比必须分开

| 口径 | 含义 | 有数据的交易所 |
| --- | --- | --- |
| `accountRatio` | 账户数多空比（多少比例账户在做多） | Binance、OKX、Bybit、Bitget |
| `topPositionRatio` | 大户持仓多空比（大户总持仓里多头占比） | **只有 Binance** |

阶段 0 实测两者方向可以相反（散户偏多 −0.20% / 大户持仓偏多 +0.25%，见 `orderflow-stage0.md` §4.4），合并成一个数会让信号互相抵消。面板分开显示，`detectContradictions` 在两者符号相反时报 `ratio-split`。

Bybit 下发的是 `buyRatio` / `sellRatio`（和为 1），已换算成 `buy / sell` 以便横向比较。

## 四类矛盾（面板的核心输出）

| 类型 | 判据 | 实际含义 |
| --- | --- | --- |
| `depth-divergence` | 区间失衡与近端 10 档失衡方向相反，且各自超过 5% | 挂单在远处，近端在反向成交 |
| `ratio-split` | 账户数比与大户持仓比相对 1 的方向相反 | 散户与大户立场不同 |
| `venue-flow-split` | 有交易所净买、有交易所净卖 | 局部行为，不是全市场一致 |
| `large-order-split` | 最大单档主动买占比与全样本相反 | 大单与碎单方向不同 |

「净流为负但 OI 上升 → 空头开新仓」这条**故意没做**：OI 只有单次快照，无法判断升降，需要两次采样做差，缺这个前提就下结论是制造虚假确定性。

## 实测样例（2026-11-11 15:58Z，BTCUSDT）

```
① 总览     OI 285,275 币 / $21.10B | 1h 净流 +$87.0M | 主动买 52.9% | ±0.5% 深度失衡 −15.2%
② 资金流   binance +$112.7M(55.1%) | okx −$25.7M(47.0%) | 其余三家无 1h 聚合
③ 分周期   binance 1h 55.1% / 15m 44.8% / 5m 40.0% / 1m 49.4%
④ 深度     binance 买 $41.9M 卖 $51.0M（区间失衡 −9.8%）但近端失衡 +79.5% → 背离
⑤ 持仓     binance OI 99,403 币 $7.35B，账户比 2.75，大户持仓比 2.20
⑥ 大单     binance 1000 笔覆盖 44 秒，≥$500K 占 0.0%
⑦ 矛盾     depth-divergence × 2（binance、bitget）、venue-flow-split × 1
```

注意第 ④ 行：同一家交易所、同一时刻，「区间失衡 −9.8%（卖厚）」与「近端失衡 +79.5%（买厚）」方向相反——这正是文章开头抓人的那类现象，现在由 `detectDepthDivergence` 自动识别，不需要人盯七个面板。

## 落盘与服务（2026-11-12）

### 数据目录

沿用 `DayShardStore` 的按天分片（`{root}/orderflow/<kind>/<venue>/<symbol>/YYYY-MM-DD.jsonl.gz`）：

| 流 | 内容 | 频率 |
| --- | --- | --- |
| `orderflow/depth/{venue}/{symbol}` | 深度快照（区间金额、近端失衡、价格墙） | 60 秒 |
| `orderflow/flow/{venue}/{symbol}` | 多周期主动买卖 | 60 秒 |
| `orderflow/positioning/{venue}/{symbol}` | OI + 两种多空比 | 60 秒 |
| `orderflow/large-orders/{venue}/{symbol}` | 钟级大单分层（整点封存） | 1 小时 |
| `orderflow/state/trades-*.json` | 续拉游标与当前小时桶（非分片） | 每轮覆盖 |

**保留期：永久**。用户确认 NAS 余量 26 TB，且这批数据（深度、逐笔）交易所不提供历史接口，
中断一天就永久缺失，因此不设滚动删除。

体积估算：depth 约 1.2 MB/天、flow 约 0.7 MB/天、positioning 约 0.5 MB/天，合计约 **2.5 MB/天**，
一年不到 1 GB。

### 只支持「从今天开始」

深度与逐笔成交**没有历史接口**（Binance 的 `metrics` 日包只含 OI 与多空比，不含深度）。
所以面板上的历史分位数、钟级对比都要靠自采积累，不存在「回补历史」的选项。

### 三个 CLI 子命令

```bash
# 采一轮快照并落盘
npx tsx packages/analytics/src/cli.ts collect-orderflow \
  --root K:/analytics --symbols BTCUSDT,ETHUSDT

# 续拉逐笔、按小时累加（建议 10 秒一轮）
npx tsx packages/analytics/src/cli.ts collect-trades \
  --root K:/analytics --symbols BTCUSDT,ETHUSDT

# 只读 HTTP 服务，供前端与 Agent 读分片
npx tsx packages/analytics/src/cli.ts serve --root K:/analytics --port 8093
```

### 只读服务

`GET /health`、`GET /orderflow/days?stream=…`、`GET /orderflow/records?stream=…&day=…`（省略 day 取最新一天）。

设计边界：
- 只绑 `127.0.0.1`、只允许 GET、流名与日期做字符校验（防目录穿越）。
- **不做计算**：聚合、矛盾识别留在 `orderflow/impl/`，服务只负责读分片。这样面板、Agent、
  脚本三方看到的是同一份口径。
- 允许任意来源（`Access-Control-Allow-Origin: *`）：桌面端 renderer 的 origin 可能是 `app://`
  或 `file://`，逐条白名单维护成本高于收益；服务本身只读且仅本机可达。

### 钟级大单分层怎么做到「不漏笔」

Binance 的 `aggTrades` 支持 `fromId` 续拉，是唯一能精确增量拉的方式：
`collect-trades` 把上次的最大成交 ID 存在状态文件里，下一轮从它之后继续拉，因此不漏。
实测：首轮 1000 笔，15 秒后续拉 295 笔。

Bybit / Bitget / Hyperliquid 没有 `fromId`，只能反复拉「最近 N 笔」并按成交 ID 去重，
两次拉取之间若超过 N 笔就会漏。这类数据的 `coverage` 标为 `sampled`，与 `exact` 分开记录。

OKX 不提供逐笔成交流，钟级分层缺这一家——面板上如实标注，不用其他所的数据补。

### NAS 部署

`deploy/nas-collector/collector.sh` 已从两个循环扩展到四个（options / volume / orderflow / trades），
共享同一套退避重启、日志轮转与心跳。新增环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `KCQ_ORDERFLOW_INTERVAL` | 60 | 快照间隔（秒） |
| `KCQ_TRADES_INTERVAL` | 10 | 逐笔续拉间隔（秒） |
| `KCQ_ORDERFLOW_SYMBOLS` | `BTCUSDT,ETHUSDT` | 订单流的品种 |
| `KCQ_ORDERFLOW_VENUES` | 全部五家 | 快照的交易所 |
| `KCQ_TRADES_VENUES` | 除 okx 外四家 | 逐笔的交易所 |

请求量：快照约 25 次/分钟，逐笔约 24 次/分钟（4 家 × 每 10 秒），远低于交易所限流。

## Agent 工具 `orderflow_snapshot`

让内置 agent 读面板。实现分三层，职责不混：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 服务端 | `analytics/serve/impl/server.ts` 的 `GET /orderflow/panel` | 读分片、组装跨所合计与矛盾（口径唯一实现） |
| 客户端 | `vue/src/features/orderflow/impl/orderflow-client.ts` | 拼 URL、超时、把非 2xx 转成可读错误 |
| 工具 | `vue/src/features/orderflow/impl/orderflow-snapshot-tool.ts` | 参数校验、品种归一化、失败文案 |

**为什么组装放在服务端**：跨所合计与矛盾识别一旦在前端再写一遍，两边数字迟早不一致。服务端调用 `reassemblePanel` + `buildTotals` + `detectContradictions`，前端只做 HTTP。

**`GET /orderflow/panel?symbol=BTCUSDT`** 返回 JSON；加 `&format=text` 返回六面板文本。

### 工具描述里的反事实

工具的 `description` 写死了阶段 0 的检验结果：

> this panel is an observational aid, NOT a trading signal. ... win rate 49.8%, t 0.09; only 2022 out of seven years was significant, and that was bear-market beta. ... Do not turn the panel into buy or sell advice.

不写这段，模型会把「多头拥挤 + 主动卖」直接翻译成看跌建议——而那正是被证伪的部分。

### 品种归一化

图表上显示 `BTCUSDT.P`（永续展示后缀），订单流数据用 `BTCUSDT`。工具在 `normalizeOrderflowSymbol` 里去掉后缀并统一大写；省略 `symbol` 参数时取当前图表品种。

### 启用前提

1. 采集器在跑（NAS），数据在 `K:\analytics\orderflow`。
2. `analytics serve` 在跑：
   ```bash
   npx tsx packages/analytics/src/cli.ts serve --root K:/analytics --port 8093
   ```
3. Agent 工具列表里勾选 `orderflow_snapshot`（新增工具不会自动进入已保存的自定义工具列表）。

服务未起时工具返回明确失败并提示检查运行状态，**不会编造面板数字**。

### 实测

`npx tsx temp/verify-orderflow-tool.ts http://127.0.0.1:8096 BTCUSDT` 走真实 NAS 数据，输出六面板文本（约 2 KB），耗时约 1 秒。

## 主动买占比的四档周期：官方聚合 + 自算（2026-11-12）

面板第 ③ 卡要 1h / 15m / 5m / 1m 四档。五家的原料不一样：

| 交易所 | 官方聚合 | 逐笔成交流 | 四档怎么来 |
| --- | --- | --- | --- |
| Binance | 1m K 线（含主动买量） | `aggTrades`，`fromId` 续拉不漏笔 | 官方 K 线累加 |
| OKX | `RUBIK taker-volume`，只有 1H | 不开放 | 只有 1h |
| Bybit / Bitget / Hyperliquid | 无 | 有，只能拉最近 1000 笔 | 自算 |

### 为什么不能直接拿「最近 1000 笔」当周期

实测这批成交只覆盖 53 / 19 / 2 秒。把它标成「1m」是错的，标成「1h」错得更远。
旧实现的做法是把它塞进一个 `windowSeconds = 实际跨度` 的记录，面板四档因此全空——**空着比假数字好**，但等于这三家没有多周期视角。

### 现在的做法：按分钟累加，向上聚合

1. 采集每 10 秒拉一次逐笔，按分钟归并进小时桶（`largeOrderAccumulator`），分钟结束后落盘
   `orderflow/flow-minutes/{venue}/{symbol}`，一行一分钟：`{minuteStart, buy, sell, trades, coverage}`。
2. 面板从最新已结束的分钟往回数：满 60 行 → 1h，满 15 行 → 15m，以此类推；
   **缺行即停**，不跳过缺口去拼两段不相连的时间。
3. 覆盖不足时只报覆盖时长（`coverageSeconds = 行数 × 60`），不显示百分比。
4. 同一周期官方聚合优先；官方没有的周期才用自算。

### 两条边界

- **跨所 1h 合计只收完整周期**（`coverageSeconds >= windowSeconds`）。混入 20 分钟样本会让合计比例系统性偏移。
- **采集停摆时周期自己消失**：锚点是「上一个已结束的分钟」，不是最新一行。数据停在 40 分钟前，四档全空，不会把旧数据标成「刚刚」。

### 为什么不用 K 线近似，也不买第三方

Bybit / Bitget / Hyperliquid 的 K 线只有总量，**不分主动买方向**，拿不到占比。
第三方聚合要花钱且口径不受控。逐笔累加是唯一能自己算清的路，代价是采集必须持续跑（NAS 上 10 秒一轮，已具备）。

## 尚未实现

1. **历史分位数**：需要至少 7 天分钟级数据才能算「当前值处于第 X 百分位」。
2. **深度短期波动范围**：实测两分钟内近端失衡可以从 −98% 翻到 +98%，面板需要显示区间而非单点。
3. **连续失败告警**：采集器对单所失败是静默跳过，某一家接口挂了不会有人知道（2026-11-12 实测 Bitget 停更 23 分钟无任何提示）。

## 复现

```bash
# 五家深度实测（打印覆盖、各区间金额、价格墙、背离）
npx tsx temp/verify-orderflow-depth.ts BTCUSDT
# 六面板完整输出（实时，不落盘）
npx tsx temp/orderflow-panel.ts BTCUSDT
# 机读 JSON
npx tsx temp/orderflow-panel.ts BTCUSDT --json
```
