# 期权关键位采集与接口

状态：采集侧已实现（2026-11-14），KCQ 脚本接口与 ETF 代理容器待做。

## 目标

把期权关键位（Gamma 翻转、Call/Put 墙、最大痛点、净 GEX、±1σ/±2σ、P/C 比）持续落盘，供图表以用户自定义指标的形式画出点位变化。

看盘时怎么读这些数（OI 墙与 Γ 加权墙的差别、正负 gamma 的基调、误读清单）见
[option-walls-guide.md](./option-walls-guide.md)；主图指标的实现见
[option-script-api.md](./option-script-api.md)。

## 链路

```text
NAS 采集器（Node，60 秒一轮）
  → K:\analytics\options\aggregate\<标的>\<日期>.jsonl.gz
  → analytics serve（GET /options/levels）
  → KCQ 脚本接口（待做）
  → 期权指标脚本（待做）
```

采集器代码在仓库 `deploy/nas-collector/`，计算在 `packages/analytics/src/options/`。

## 快照字段（schemaVersion 2）

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

### 与 schemaVersion 1 的差异

版本 1 只有扁平字段（`callWall`、`putWall`、`maxPainUsd`、`gammaFlipUsd` 等，全链口径），没有 `nearTerm`、P/C 比与 ±2σ。版本 2 改成两块视图，消费方按 `schemaVersion` 判断。

## 保留期

`OPTION_CHAIN_RETENTION_DAYS = 90`，每次采集后清理三条流与旧目录：

- `options/chain/<标的>`
- `options/aggregate/<标的>`
- `legacy/options-levels/<品种>`（cloudtrade 时代的数据，只删 `YYYY-MM-DD.jsonl.gz`）

清理函数在 `packages/analytics/src/options/impl/legacyPrune.ts` 与 `cli.ts` 的 `pruneOptionStreams`。

## 只读接口

`GET /options/levels?currency=BTC[&day=YYYY-MM-DD]`

返回 `{ currency, day, days, latest }`：`days` 是可用日期，`latest` 是当日最后一行。服务沿用 `analytics serve`，默认端口 8093，只绑 127.0.0.1。

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
