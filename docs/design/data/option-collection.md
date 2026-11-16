# 期权关键位采集与接口

状态：采集侧已实现（2026-11-14），KCQ 脚本接口与 ETF 代理容器待做。

## 目标

把期权关键位（Gamma 翻转、Call/Put 墙、最大痛点、净 GEX、±1σ/±2σ、P/C 比）持续落盘，供图表以用户自定义指标的形式画出点位变化。

看盘时怎么读这些数（OI 墙与 Γ 加权墙的差别、正负 gamma 的基调、误读清单）见
[option-walls-guide.md](./option-walls-guide.md)；主图指标的实现见
[option-script-api.md](./option-script-api.md)。

## 链路

```text
NAS 采集器（Node，60 秒一轮；BTC/ETH 走 Deribit，SOL/BNB/XRP 走 Binance）
  → K:\analytics\options\aggregate\<标的>\<日期>.jsonl.gz
  → analytics serve（GET /options/levels）
  → KCQ 脚本接口（待做）
  → 期权指标脚本（待做）
```

采集器代码在仓库 `deploy/nas-collector/`，计算在 `packages/analytics/src/options/`。

## 品种与场所

一个品种只登记一个主场所，注册表在 `packages/analytics/src/options/markets.ts`（新增品种只改那里一处）：

| 标的 | 场所 | 场内写法 | 可采到期 |
| --- | --- | --- | --- |
| BTC | Deribit | `BTC` | 8 个（最远 90 天） |
| ETH | Deribit | `ETH` | 8 个（最远 90 天） |
| SOL | Binance | `SOLUSDT` | 4 个（最远 10.6 天） |
| BNB | Binance | `BNBUSDT` | 5 个（最远 10.6 天） |
| XRP | Binance | `XRPUSDT` | 2 个（最远 10.6 天；1 张 = 100 XRP） |

ADA 等品种没有任何期权场所，不登记：面板按「没有期权标的」提示，不猜、不沿用上一个品种。数据目录用统一标的代码（`options/aggregate/SOL/`），场所随行落盘（`venue` 字段）。

两个场所的差异都收在适配器里：

- Deribit 用每个到期自己的期货价当远期价格，反向合约、标记价以币计价。
- Binance 没有每个到期的期货价，**用现货指数价近似远期价格**（短期限误差小，期限越长越明显）；
  数字多以字符串返回；持仓量按张数返回，乘 `exchangeInfo.unit` 折成标的数量，与 Deribit 口径对齐。
- alt 期权只有 10 天内的到期，所以期限结构只有 2–4 个点；25Δ 偏斜按「7–90 天里最接近 30 天」的规则会落到 10.5 天，报告里必须带上实际到期日。
- 持仓规模比 BTC/ETH 小两到三个数量级：按名义价值实测 SOL 约 230 万美元、BNB 约 300 万美元、XRP 约 2100 万美元，BTC/ETH 是十亿美元级。XRP 的 `unit` 是 100（1 张 = 100 XRP），持仓已按 `unit` 折成标的数量，所以墙位与 GEX 仍可与 BTC/ETH 同口径比较——但只能当薄数据参考，不能当 BTC 那种量级的锚点。

## 快照字段（schemaVersion 3）

一份快照同时给两套视图：

| 视图 | 口径 | 用途 |
| --- | --- | --- |
| `nearTerm` | 先在 `0.15 <= DTE <= 14` 天内取「持仓达到窗口最大桶 30%」的最近到期日 | 主图默认口径，对短期对冲最敏感 |
| `allChain` | `0 < DTE <= 90` 全部到期合并 | 参考线，也是翻转位的兜底 |

近月桶不用「最近的那个到期日」：Deribit 常有 2～3 个几乎没人交易的日签（实测 4,852 张对
周签 27,760 张），那种桶的墙位只代表几千张挂单，一笔大单就能翻墙。窗口下限 0.15 天（约 3.6 小时）
让指标在交割前自动切到下一个桶；窗口内一个桶都没有时退回最近的未来到期日。

两套都含 `gammaFlipUsd`、`callWall`、`putWall`、`callGammaWall`、`putGammaWall`、`maxPainUsd`、`netGexUsdPerPercent`、`putCallOiRatio`、`totalOpenInterest`、`contractCount`。近月额外含到期日、DTE、平值 IV、±1σ 与 ±2σ 上下沿。

墙位有两个口径，同一份快照都带上：

| 字段 | 口径 | 读什么 |
| --- | --- | --- |
| `callWall` / `putWall` | 该方向原始 OI 最大的行权价 | 仓位聚集 / 结算磁吸位 |
| `callGammaWall` / `putGammaWall` | 该方向 `OI × Γ` 合计最大的行权价 | 日内对冲火力最密集处（主口径） |

主图指标与快速解读用 Γ 加权墙；面板两套并排显示。远端彩票 Call 名义持仓可以很大，但 Γ 接近 0，
做市商不会为它调仓，所以 OI 墙经常落在离现价很远的行权价上。

翻转位是「净 GEX 过零的现价」：把现价按 ±20% 扫 41 个候选点，每个点等比平移期货价后
重新定 gamma，累计全链净 GEX，取离现价最近的一次过零并线性插值。网格内不过零、或过零点
偏离现价超过 10%，该视图的翻转位就是 `null`——深虚位的偶然过零没有经济意义。

取值规则在 `gammaFlip` 字段：

- 近月算得出翻转位就用近月，`source: 'near-term'`。
- 近月为 `null` 时用全链兜底，`source: 'all-chain'`。

墙位在该视图没有对应方向持仓时为 `null`，不用另一套视图的数据顶替。

### 逐到期汇总与 25Δ 偏斜（schema 3）

版本 3 起每行带 `expiries[]`，按到期升序：

| 字段 | 含义 |
| --- | --- |
| `expiryIso` / `dteDays` | 到期日与剩余天数 |
| `atmIvPercent` | 该到期的平值 IV：取行权价最接近该到期期货价的合约，call 与 put 取平均 |
| `putCallOiRatio` | 该到期的 put OI ÷ call OI；call 持仓为 0 时为 null |
| `totalOpenInterest` | 该到期的总持仓 |

行级另有三个 25Δ 偏斜字段：`skew25dVolPoints`、`skew25dExpiryIso`、`skew25dReason`。口径：

- 目标期限 30 天，在 `7 <= DTE <= 90` 的到期里取最接近的那一个（Deribit BTC 实测 8 个到期，选中 38.8 天的月度）。
- delta 用 Black-76 远期口径（r = 0）：call 为 N(d1)、put 为 N(d1) − 1。
- 两翼按 |delta| 在相邻行权价之间线性插值到 0.25，不取最近行权价：实测最近点可偏离 0.25 达 7–12%。
- 结果 = IV(25Δ call) − IV(25Δ put)，单位波动点；负值表示下行保护更贵。
- 不可用时 `skew25dReason` 写明原因：`no-eligible-expiry`（没有 7 天以上到期）、`missing-call-wing` / `missing-put-wing` / `missing-wings`（链没伸到 25Δ）、`invalid-forward`。

不用近月：近月到期每天滚动（DTE 0.2–14 天），偏斜随期限变化（实测同期 0.83 天为 −6.89、38.83 天为 −5.07 个波动点），混着期限的数字无法跨日比较。

### 与 schemaVersion 1 的差异

版本 1 只有扁平字段（`callWall`、`putWall`、`maxPainUsd`、`gammaFlipUsd` 等，全链口径），没有 `nearTerm`、P/C 比与 ±2σ。版本 2 改成两块视图；版本 3 增加 `expiries[]` 与 25Δ 偏斜。消费方按 `schemaVersion` 判断。

## 保留期与分层

四类分片各自一段保留期，都在 `packages/analytics/src/options/types.ts` 里具名：

- 分钟行：`options/aggregate/<标的>/YYYY-MM-DD.jsonl.gz`，365 天（`OPTION_MINUTE_RETENTION_DAYS`）
- 小时行：`options/aggregate/<标的>/hourly/YYYY-MM-DD.jsonl.gz`，365 天（`OPTION_HOURLY_RETENTION_DAYS`）
- 日行：`options/aggregate/<标的>/daily/YYYY-MM-DD.jsonl.gz`，3650 天（`OPTION_DAILY_RETENTION_DAYS`）
- 原始链：`options/chain/<标的>/`，90 天（`OPTION_CHAIN_RETENTION_DAYS`）

原始链只在**采样分钟**落盘：`collect-options --with-chain --with-chain-every <分钟>`（默认 5，最小 1）。
判定用采集时刻本身（`isChainCaptureMinute`，`options/impl/chainCadence.ts`）：自 epoch 起的分钟数能被间隔整除即采样分钟。
不靠进程内计数，因为 `collector.sh` 每轮起一个新进程、在 shell 层 sleep，进程内状态跨不了轮；用时钟对齐则重启、
补跑、并发多进程都不改变口径。

判定按**整轮**做一次（用轮次起点时刻），不按单个标的的捕获时刻：NAS 实测 5 个品种一轮约 80 秒，
Deribit 的两个品种与 Binance 的三个品种会落在相邻两个分钟里，按标的分头判定会写出「半轮链」。

为什么不像聚合位那样每分钟落：Deribit BTC 全链约 980 张合约，每分钟落即约 141 万行/天、原始约 200MB/天；
5 分钟节奏降到约 28 万行/天，单次快照实测 23KB（982 行），gzip 约 5–6.5MB/天，与 #17 规格的体积假设一致。`--with-chain-every 1` 可回到每分钟。

分钟层就是聚合流的根目录，没有 `minute/` 子目录：采集器一直在写这个路径，加一层要迁移历史文件，而目录层级不承载任何计算口径。层与路径的对应只在 `options/impl/streams.ts` 定义一次。

小时行与日行是**边界那一刻的分钟行原样快照**（`aggregatedRows` 记时段内实际分钟行数），不做均值——IV 是瞬时报价，均值没有金融含义。

滚上由 `options/impl/rollup.ts` 完成：只处理已结束的时段、去重键取时段起点，幂等；`collect-options` 每轮调用，断线期间漏掉的时段自动补上。也可以单独补历史：

```bash
cd packages/analytics
./node_modules/.bin/tsx src/cli.ts backfill-options --root K:/analytics --currencies BTC,ETH --from 2026-11-10
```

清理走 `options/impl/retention.ts` 的 `purgeOptionStreams`（按层保留期），`legacyPrune.ts` 只清理 cloudtrade 时代的 `legacy/options-levels/`。

## 只读接口

`GET /options/levels?currency=BTC[&day=YYYY-MM-DD]`

返回 `{ currency, day, days, latest }`：`days` 是可用日期，`latest` 是当日最后一行。

`GET /options/series?currency=BTC[&step=minute|hour|day][&days=N][&limit=M]`

返回 `{ currency, step, days, rows, rowCount, truncated }`。`days` 是实际读取的日分片；`limit` 上限 20000，超出时只返回最后 `limit` 行并标 `truncated`。缺参数或取值非法返回 400，没有数据返回 200 与空 `rows`。

`GET /options/stats?currency=BTC[&windows=30,90,365]`

返回 `{ currency, source, stale, latestCapturedAt, rv20, vrp, termStructure, skew25dVolPoints, skew25dExpiryIso, windows }`。每个窗口给 `windowDays`、`expectedDays`、`sampleDays`、`ivLatest`、`ivHigh`、`ivLow`、`ivRank`、`ivPercentile`。只读日行（缺失回退小时行），**不读分钟行**；样本天数不足 5 天时两个分位返回 null。

`termStructure` 与 `skew25dVolPoints` 取**参与统计的最新样本行**：该行是 schema 3 时带上逐到期 ATM IV 与偏斜，schema 2 及更早时为 null。因此这两个字段是收盘口径（可能滞后到 24 小时），面板上的实时 ATM IV 仍来自分钟行。

服务沿用 `analytics serve`，默认端口 8093，只绑 127.0.0.1。统计口径与读法见 `docs/design/analytics/options-reading-guide.md`。

## ETF 代理品种（待做）

黄金等品种没有原生期权，只能用 ETF 代理（XAUUSD → GLD）。方案：

- Python 容器用 yfinance 拉 ETF 期权链，写**原始链**到 `options/chain-source/<标的>/<日期>.jsonl.gz`。
- Node 侧读原始链，调用同一个 `aggregateOptionChain` 算聚合位，写 `options/aggregate/<标的>/`。

为什么不在 Python 里直接算 GEX：同一套数学只能有一份实现，两侧各写一遍迟早对不上。

已知约束：Yahoo 对裸 HTTP 请求返回 429；yfinance 自带 cookie 与 crumb，能稳定通过（实测本机 27/27 成功）。所以这一路必须保留 Python，不重写成 Node。

## 实测锚点（2026-11-14）

- NAS：`192.168.0.19`，SSH 端口 55，DSM，部署目录 `/volume1/docker/kcq/app`，数据卷 `/volume1/docker/kcq/analytics`（Windows 映射为 `K:\analytics`）。
- NAS 代理由另一个容器发布在 `0.0.0.0:7891`；compose 用 `network_mode: host`，容器内按 `127.0.0.1:7891` 访问。桥接网络访问 NAS 局域网 IP 会被 hairpin NAT 挡掉。
- 期权循环已在跑：`options/aggregate/{BTC,ETH}/<日期>.jsonl.gz` 每天约 1008 行，`logs/options.heartbeat` 每分钟更新。
- 历史：`legacy/options-levels/` 为 cloudtrade 迁移数据，共 11708 个文件（含其他品类），按 90 天清理。

## 工作台面板与 AI 快捷解读（2026-11-14）

数据只有落在交易员看得见的地方才有用。除了主图指标，另有两处消费同一份快照：

- **期权面板**（`packages/vue/src/features/options/`）：工作台侧栏新增「期权」页签，与订单流并列。四张卡片是：关键位（翻转 / Call 墙（Γ 加权）/ Put 墙（Γ 加权）/ Call 墙（OI）/ Put 墙（OI）/ 最大痛点，都带距现价百分比）、近月波动（现货指数、ATM IV、DTE、到期日、±1σ、±2σ）、持仓与 gamma 敞口（近月与全链的净 GEX、P/C、持仓）、快速解读。
- **AI 快捷解读**：Agent 输入框上方多一颗「快速解读」胶囊，内容由 `describeOptionLevels` 生成——现价、翻转位相对位置与 gamma 区间、两侧墙位距离、最大痛点、ATM IV 与 DTE、±1σ、P/C。点击把它填进草稿，用户可以直接发给模型扩写。

两处共用同一个 `useOptionPanel` 轮询状态（60 秒，与采集间隔一致），所以面板与胶囊永远看同一份数据。期权标的由图品种经 `resolveOptionUnderlying` 映射到 BTC / ETH / XAUUSD；映射不到时面板提示「当前品种没有对应的期权标的」，不会悄悄显示上一个品种的数字。

口径提醒：这些是观察锚点，不是买卖信号。一句解读只陈述事实与相对位置，不给方向判断。

## Agent 工具 `option_snapshot`

`packages/vue/src/features/options/impl/option-snapshot-tool.ts` 把同一份数据交给模型：

- 参数：`currency`（省略时按图表品种经 `resolveOptionUnderlying` 映射，`BTCUSDT.P` → `BTC`）、`format`（`text` 默认，`json` 返回解析后的快照）。
- 文本报告第一句是人话解读，随后按「近月 / 全链 / 波动 / 持仓 / 采集时刻」分行，模型可以直接引用具体数字。
- 失败分支写明原因与排查方向：采集器与 `analytics serve` 是两个独立进程，任一没跑都会失败；并明确要求模型不要凭猜测给关键位。
- 工具描述里写死「观察锚点，不是买卖信号」，避免模型把墙位读成支撑阻力的定论。

注册点在 `browser-agent/tools/impl/browser-tool-registry.ts` 的 `registerTools`，与 `orderflow_snapshot` 并列，共用同一个 `getOrderflowBaseUrl()`（同一个 analytics 服务）。

注意：保存过自定义工具列表的用户**不会**自动获得新工具，需要在 Agent 设置里勾选 `option_snapshot`。

## 待做

1. ETF 代理容器与原始链聚合命令。
