# Deribit 公开期权 API 内建可行性核查

- 核查日期：2026-11-09 22:58–23:26（Asia/Shanghai）
- 核查方式：真发 HTTP 请求（Node.js 24.22.1 内置 `fetch` / 原生 `https` / 内置 `WebSocket`），非只读文档
- 目标：为决策票 #3 判定「Deribit 公开期权 API 能否内建到 KCQ」提供事实依据
- 引用来源见文末「来源」章节

---

## 一句话结论

**有条件内建**：`get_book_summary_by_currency` 单次即可拿到 BTC 876 张 / ETH 746 张全链，`open_interest`、`mark_iv`、`underlying_price`、`mark_price`、`volume` 五项 GEX 必需字段全部覆盖（中位耗时 474 ms / 602 ms），CORS 按 Origin 回显可直接连接；但 **`greeks` 字段在当前快照里完全不存在**（旧实测为「空值」，现为「整字段缺失」），**没有历史 OI 与逐行权价 IV 历史**（`get_mark_price_history` 存在但只是约 6 分钟滚动缓存），因此必须本地自算 gamma（已实测与官方 `greeks.gamma` 吻合）。另有一条硬约束：**本机直连 Deribit 必然超时，必须走 `127.0.0.1:7078` 代理**。

---

## 实测环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows（MSYS Bash 作为命令行外壳） |
| Node.js | v24.22.1 |
| 代理 | 系统代理已开启（`ProxyEnable=1`，`ProxyServer=127.0.0.1:7078`）；环境变量 `HTTPS_PROXY` / `HTTP_PROXY` 均为 `http://127.0.0.1:7078` |
| 本机时区 | `GMT+0800`（`getTimezoneOffset() = -480`） |

---

## 一、端点与合约规模（实测）

### 1.1 BTC

```
GET https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option
```

| 观测项 | 实测值 |
| --- | --- |
| HTTP 状态 | 200 |
| 合约数 | **876 张** |
| 响应体大小 | 391,511 字节（gzip 后 `content-length` 40,716） |
| Call / Put | 438 / 438（严格对半） |
| 到期日数 | **11 个**（10NOV26、11NOV26、12NOV26、13NOV26、20NOV26、27NOV26、25DEC26、29JAN27、26MAR27、25JUN27、24SEP27） |
| OI 合计 | 341,578.4 |
| `mark_iv` 范围 | 37.13 ~ 133.27（全部非零） |
| `underlying_price` 唯一值 | 23 个（按到期日分组，非全局单值） |

### 1.2 ETH

```
GET https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=ETH&kind=option
```

| 观测项 | 实测值 |
| --- | --- |
| HTTP 状态 | 200 |
| 合约数 | **746 张** |
| 响应体大小 | 331,308 字节 |
| Call / Put | 373 / 373 |
| 到期日数 | **11 个** |
| OI 合计 | 1,505,889.0 |
| `mark_iv` 范围 | 53.31 ~ 146.14 |

**结论**：BTC 与 ETH 字段结构完全一致，同一套解析代码可覆盖两个标的，只需换 `currency` 参数。

---

## 二、字段完备性（实测）

### 2.1 顶层字段清单（20 个，BTC 876 条全部命中，无一条缺失）

`instrument_name`、`open_interest`、`mark_iv`、`underlying_price`、`mid_price`、`volume`、`volume_usd`、`mark_price`、`bid_price`、`ask_price`、`last`、`high`、`low`、`price_change`、`interest_rate`、`estimated_delivery_price`、`underlying_index`、`base_currency`、`quote_currency`、`creation_timestamp`

### 2.2 必需字段逐项核对

| 字段 | BTC 缺失数 | ETH 缺失数 | 说明 |
| --- | --- | --- | --- |
| `instrument_name` | 0 / 876 ✅ | 0 / 746 ✅ | 可 100% 用正则解析出标的、到期日、行权价、Call/Put |
| `open_interest` | 0 / 876 ✅ | 0 / 746 ✅ | 单位见 §2.4 |
| `mark_iv` | 0 / 876 ✅ | 0 / 746 ✅ | **百分数**（44.4 表示 44.4%），见 §2.3 |
| `underlying_price` | 0 / 876 ✅ | 0 / 746 ✅ | 该合约对应**到期日的期货价**，不是现货指数 |
| `mark_price` | 0 / 876 ✅ | 0 / 746 ✅ | 全链无一张为 0，可作定价主字段 |
| `creation_timestamp` | 0 / 876 ✅ | 0 / 746 ✅ | 链的 source timestamp |
| `volume` | 0 / 876 ✅ | 0 / 746 ✅ | 当日成交量，单位同 OI |
| `mid_price` | **39 张为 0** ⚠️ | **18 张为 0** ⚠️ | 这些合约 `bid_price` 为 `null`（只有卖单），`mark_price` 仍非零 |

`mid_price` 为 0 的 BTC 合约样例：

```
BTC-27NOV26-112000-C  bid=null ask=0.0001 mark=0.00006822 oi=97.6
BTC-10NOV26-83000-C   bid=null ask=0.0001 mark=0.00000241 oi=61.2
BTC-12NOV26-84000-C   bid=null ask=0.0002 mark=0.00016839 oi=0.1
```

**处理方式（推断）**：`mark_price` 无一张为 0，用 `mark_price` 而不是 `mid_price` 作为定价主字段可完全规避这个缺口；`mid_price` 降级为流动性判断的辅助字段。

### 2.3 `mark_iv` 单位验证（实测 + 反解）

用反向合约（币本位）Black-76 反解，`mark_iv` 按百分数解释：

| 合约 | DTE | `mark_iv` | `mark_price` | 用 `mark_iv/100` 算出的理论价 | 比值 |
| --- | --- | --- | --- | --- | --- |
| BTC-27NOV26-70000-C | 17.7 d | 41.89 | 0.07958952 | 0.079681 | 0.999 |
| BTC-25DEC26-104000-C | 45.7 d | 44.40 | 0.00138166 | 0.001384 | 0.998 |
| BTC-26MAR27-112000-P | 136.7 d | 41.13 | 0.4734295 | 0.473265 | 1.000 |

**结论**：REST 的 `mark_iv` 是**百分数**（44.4 → 44.4%）。

⚠️ **同一个字段名在 WebSocket 里是小数**：`markprice.options.btc_usd` 频道返回 `iv: 0.5293`（意为 52.93%）。REST 与 WS 两处必须分别按百分数 / 小数处理，不能共用同一套换算。

### 2.4 `open_interest` 单位（实测推导）

`get_instruments` 返回合约规格：

| 标的 | `contract_size` | `min_trade_amount` | `settlement_currency` | `instrument_type` |
| --- | --- | --- | --- | --- |
| BTC | 1 | 0.1 | BTC | `reversed` |
| ETH | 1 | 1 | ETH | `reversed` |

**推断**：BTC 期权 OI 单位是「张」，每张 = 1 BTC；ETH 每张 = 1 ETH。Deribit 期权是反向合约，权利金以币计价（`mark_price` 0.0488 = 0.0488 BTC），所以 GEX 的美元换算需要乘 `underlying_price`。

### 2.5 `greeks` 字段：**整字段缺失**

这是旧实测（「greeks 为空」）的当前状态更新：

| 检查项 | 结果 |
| --- | --- |
| `get_book_summary_by_currency` 返回对象里有 `greeks` 键 | ❌ 876 条**全都没有该键**（不是空对象，是键不存在） |
| 加 `&include_greeks=true` 参数 | ❌ 仍是 876 条，仍无 `greeks` |
| 加 `&greeks=true` 参数 | ❌ 同上 |
| `public/ticker?instrument_name=...`（单合约） | ✅ **有** `greeks: {delta, gamma, vega, theta, rho}` |
| `public/get_greek` | ❌ `-32601 Method not found`（该接口不存在） |
| WebSocket `ticker.{name}.100ms` | ✅ **有**完整 `greeks` |

**结论**：当前状态比旧实测更差——不是「greeks 为空」，而是全链快照**根本不返回 greeks**。想拿 greeks 只能逐合约调 `ticker`（876 次）或订阅 WebSocket。

**逐合约拉 greeks 的成本（实测 + 推算）**：单次 `ticker` 300 ms；876 张在 20 req/s 稳态限流下理论 ≥ 44 秒。**对 KCQ 的期权链视图不可接受**。

**替代方案可行性（实测）**：本地自算 gamma。用 `mark_iv` 代入反向合约 Black-76，与 Deribit 官方 `greeks.gamma` 对比：

| 合约 | Deribit `gamma` | 自算 `gamma` | 比值 | Deribit `delta` | 自算 `delta` |
| --- | --- | --- | --- | --- | --- |
| BTC-27NOV26-73000-C | 0.00006 | 0.00005746 | 1.044 | 0.64853 | 0.64853 |
| BTC-27NOV26-80000-C | 0.00005 | 0.00005007 | 0.999 | 0.23367 | 0.23365 |
| BTC-25DEC26-104000-C | 0（四舍五入到 1e-5） | 0.00000488 | — | 0.02467 | 0.02468 |

**结论**：本地自算 gamma 与 Deribit 官方值一致（差异来自 Deribit 只保留 5 位有效数字）。**GEX 不需要 greeks 字段，本地自算完全够用。**

---

## 三、耗时（实测）

### 3.1 BTC / ETH 各 6 次交替测量

```
BTC: 1022, 1017, 323, 474, 334, 417 ms  → min 323 / median 474 / max 1022 / 平均 598
ETH:  830,  602, 460, 338, 314, 819 ms  → min 314 / median 602 / max 830 / 平均 561
```

### 3.2 冷启动 vs 热缓存

| 场景 | BTC 耗时 | 说明 |
| --- | --- | --- |
| 首次请求（冷） | 1850 ms | 连接建立 + 完整 TLS 握手 |
| 后续（热） | 389 ~ 454 ms | 连接复用 |
| 5 次连跑 | min 389 / median 454 / max 1345 | 出现一次 1345 ms 抖动 |

响应头：`x-cache-status: HIT`、`cf-cache-status: DYNAMIC`、`cache-control: no-store, public, max-age=1`。CDN 缓存 1 秒，不构成陈旧数据风险。

**结论**：单次全链拉取 **≈ 0.5 秒（中位）**，最差 1.8 秒。BTC + ETH 串行拉一轮约 1.1 秒。

### 3.3 本地计算耗时

端到端验证（拉链 → 解析 → 过滤 0 < DTE ≤ 90 → 算净 GEX / 最大痛点 / Call-Put 墙 / ±1σ）：

```
BTC: 拉链 793 ms + 本地计算 <1 ms （876 张 → 过滤后 455 张）
ETH: 拉链 532 ms + 本地计算 <1 ms （746 张 → 过滤后 409 张）
```

**结论**：本地计算是微秒级，不构成性能瓶颈。耗时 100% 由网络决定。

---

## 四、数据时点与实时性（实测）

### 4.1 哪个字段代表链的 source timestamp

**`creation_timestamp`**（毫秒 Unix 时间戳），每条记录都有：

| 观测项 | 实测值 |
| --- | --- |
| BTC 876 条里唯一值个数 | 16 ~ 34 个（同一批快照内几乎相同） |
| 唯一值跨度 | 63 ms |
| 与 HTTP `date` 响应头的差值 | **-1354 ms**（字段比响应头早约 1.3 秒） |
| 20 秒后再次拉取 | 时间戳推进 13.0 s / 19.3 s / 31.7 s（对应实际等待间隔） |

⚠️ 字段名叫 `creation_timestamp` 但语义是「本次快照生成时刻」，不是「合约创建时刻」（合约创建时刻在 `get_instruments` 里，是另一个值）。这是 Deribit 的命名坑。

**结论**：用 `creation_timestamp` 作为链的 source timestamp。数据有约 **1.3 秒的新鲜度延迟**（快照生成到 HTTP 响应返回）。

### 4.2 OI 是否实时

**是实时快照，但 OI 本身变化很慢**。60 秒连续观测：

| 时点 | OI 合计 | 变化 | volume 合计 | 变化 | `mark_price` 合计变化 | 时间戳推进 |
| --- | --- | --- | --- | --- | --- | --- |
| t=0 | 341,578.4 | — | 30,483.20 | — | — | — |
| t=+10s | 341,578.1 | -0.3 | 30,483.50 | +0.30 | +0.0209 | 13.0 s |
| t=+20s | 341,578.6 | +0.5 | 30,484.00 | +0.50 | +0.1472 | 19.3 s |
| t=+30s | 341,579.5 | +0.9 | 30,484.50 | +0.50 | -0.0557 | 31.7 s |

同时验证单合约一致性：`book_summary` 与 `ticker` 的 `open_interest` 完全相同（25.3 = 25.3），`ticker.timestamp` 年龄 0.7 秒。

**结论**：
- OI 是实时快照，每次请求都拿当时值，不是缓存的历史值。
- 但 OI 在 30 秒内只变动 ±0.9（占总量 0.0003%），**高频刷新对 OI 没有收益**。
- `mark_price` 在 30 秒内的变动量级（±0.06 合计）明显大于 OI，说明**价格驱动的 Gamma 变化比 OI 变化快得多**。

---

## 五、CORS（实测）

### 5.1 响应头

| 场景 | `access-control-allow-origin` |
| --- | --- |
| 带 `Origin: http://localhost:5173` | `http://localhost:5173`（**回显该 Origin**） |
| 带 `Origin: app://kcq` | `app://kcq` |
| 带 `Origin: file://` | `file://` |
| 带 `Origin: null` | `null` |
| 带 `Origin: https://kcq.example.com` | `https://kcq.example.com` |
| **不带 Origin**（Node 直连） | `*` |

其他 CORS 头：

```
access-control-allow-methods: GET, POST, OPTIONS
access-control-allow-headers: Authorization,User-Agent,Range,X-Requested-With,Content-Type,Partner
vary: Accept-Encoding, Origin,Authorization,Partner
access-control-allow-credentials: (null，不存在)
access-control-expose-headers: (null，不存在)
access-control-max-age: (null，不存在)
```

### 5.2 OPTIONS 预检

```
OPTIONS → 204
access-control-allow-origin: http://localhost:5173
access-control-allow-methods: GET, POST, OPTIONS
access-control-allow-headers: Authorization,User-Agent,Range,X-Requested-With,Content-Type,Partner
```

### 5.3 结论

- **浏览器可以直连**，`get_book_summary_by_currency` 是简单 GET 请求（无自定义头），不触发预检，直接 200。
- Electron 场景：`file://` 和 `null` Origin 都被回显，同样可用。
- 不需要 `Access-Control-Allow-Credentials`（公开端点无 Cookie 鉴权）。
- **回显而非通配**是有意义的差别：回显意味着 Deribit 明确允许任意来源，同时响应带 `Vary: Origin`，CDN 缓存不会串源。

---

## 六、速率限制（实测 + 官方文档）

### 6.1 响应头

**没有任何限流相关响应头**。实测检查 `ratelimit-*`、`retry-after`、`x-ratelimit-*` 全部为空。所以无法从响应头读剩余额度，只能靠 429 错误码反推。

### 6.2 压力测试（实测）

| 场景 | 结果 |
| --- | --- |
| 顺序 30 次 `get_time` | 12,028 ms，30 × 200，0 × 429 |
| 30 并发 `get_time` | 1,381 ms，30 × 200，0 × 429 |
| 60 并发 `get_time` | 4,162 ms，60 × 200，0 × 429 |
| 5 并发 `book_summary` | 863 ms，5 × 200，0 × 429 |

**结论**：在实测强度（60 并发）下**没有触发限流**。KCQ 的刷新节奏（分钟级）距限流阈值有数百倍余量。

### 6.3 官方文档规定（事实）

来源：[Deribit Rate Limits](https://docs.deribit.com/articles/rate-limits)

| 规则 | 数值 |
| --- | --- |
| 计费方式 | 信用点制（credit-based），按子账户独立 |
| 非撮合引擎请求 | **500 credits / 请求** |
| 最大信用池 | **50,000 credits** |
| 补充速率 | **10,000 credits/s**（即 20 req/s） |
| 突发容量 | **100 请求**（50,000 ÷ 500） |
| 超额错误 | `too_many_requests`，**code 10028**，并**断开连接** |
| 未授权公开请求 | **按 IP 限流**，不占子账户池 |
| `public/get_instruments` 特例 | 10,000 credits / 请求，1 req/s，突发 50 |

**推断**：按 500 credits/请求、50,000 池计算，公开匿名调用在单 IP 上可承受的持续速率为 20 req/s。KCQ 若每分钟拉 1 次 BTC + ETH，占用 2 req/min，远低于阈值。但文档明确「未授权公开请求按 IP 限流」，阈值未公开，实际比授权调用更严。

### 6.4 实测到的错误码（用于 KCQ 错误映射）

| 请求 | HTTP | JSON-RPC code |
| --- | --- | --- |
| 合法请求 | 200 | 无 error |
| `currency=XXX`（非法币种） | 400 | `-32602 Invalid params` |
| `ticker` 用不存在的合约名 | 400 | `-32602 Invalid params` |
| `get_index_price?index_name=xxx_usd` | 400 | `-32602 Invalid params` |
| 不存在的方法 | 400 | `-32601 Method not found` |
| `kind=future`（book_summary 不校验） | **200** | 无 error（静默返回 futures） |

---

## 七、历史数据可得性（实测）

这一节是本轮核查里**推翻初始假设最多**的部分，结论已按实测修订。

### 7.1 逐接口探测结果

| 接口 | 结果 | 真实语义 |
| --- | --- | --- |
| `get_option_mark_price_history` | ❌ `-32601 Method not found` | **不存在**（任务里假设的接口名，实测确认无此方法） |
| `get_open_interest_history` | ❌ `-32601 Method not found` | 不存在 |
| **`get_mark_price_history`** | ✅ **存在**（需 `instrument_name` + 毫秒 `start_timestamp`/`end_timestamp`） | **只有约 6 分钟滚动窗口**，详见 §7.2 |
| `get_volatility_index_data` | ✅ 存在 | **DVOL 指数**，可回溯 **500+ 天**，详见 §7.3 |
| `get_historical_volatility` | ✅ 存在 | **已实现波动率**（非隐含），384 点 / 16 天 / 1 小时粒度 |
| `get_tradingview_chart_data` | ✅ 存在 | 单合约 OHLC K 线（含 `volume`/`ticks`） |
| `get_last_trades_by_instrument` | ✅ 存在 | 逐笔成交，**每笔含 `iv` 字段** |
| `get_delivery_prices` | ✅ 存在 | 历史结算价，实测单次返回 100 条，覆盖 2026-08-02 ~ 2026-11-09 |
| `get_index_price_history` | ❌ `-32601 Method not found` | 不存在 |
| `get_instruments?expired=true` | ✅ 200（70 条） | 已到期合约在清单里，但 `book_summary` **忽略 `expired` 参数**（仍返回 876 条当期） |

### 7.2 `get_mark_price_history` 的真实能力（实测，重要）

**方法存在**，但参数必须用**毫秒**时间戳，且**只返回滚动缓存**：

| 请求窗口 | 返回条数 | 实际覆盖跨度 | 最早点 |
| --- | --- | --- | --- |
| 最近 3 分钟 | 180 | 2.99 分钟 | 3 分钟前 |
| 最近 5 分钟 | 299 | 4.99 分钟 | 5 分钟前 |
| 最近 10 分钟 | 359 | **5.98 分钟**（封顶） | 约 6 分钟前 |
| 最近 1 小时 | 359 | 5.98 分钟（封顶） | 约 6 分钟前 |
| 最近 1 天 ~ 180 天 | 348 ~ 359 | 6 分钟（封顶） | 约 6 分钟前 |
| **6 小时前那个窗口** | **0** | — | — |
| **昨天同一时刻** | **0** | — | — |

- 相邻点间隔：median **1007 ms**、平均 1004 ms（约 1 秒一个点）。
- 返回结构 `[[毫秒时间戳, 值], ...]`，值是 **mark_price（价格）不是 IV**。
- 传 `count` / `limit` / `resolution` 参数**均无效**（条数不变）。
- 该区间内没有成交/报价的合约返回 **0 条**（如 `BTC-10NOV26-85000-P`、`BTC-24SEP27-60000-C`）。

**结论**：`get_mark_price_history` 是「最近约 6 分钟的秒级 mark price 滚动缓存」，**不是历史回溯接口**。可用来还原最近几分钟的 IV 曲线，不能拿到昨天或上周的数据。

### 7.3 DVOL 指数（`get_volatility_index_data`）回溯能力（实测）

**参数必须用毫秒时间戳**（用秒会静默返回 0 条）。

| 窗口 | resolution | 返回点数 | 实际覆盖 | continuation |
| --- | --- | --- | --- | --- |
| 1 天 | 60 s | 1000（封顶） | 0.69 天 | 有（分页） |
| 7 天 | 3600 s | 169 | 7.00 天 | 无 |
| 30 天 | 3600 s | 721 | 30.00 天 | 无 |
| 90 天 | 3600 s | 1000（封顶） | 41.63 天 | 有 |
| 180 天 | 43200 s | 361 | 180.00 天 | 无 |
| 365 天 | 43200 s | 731 | 365.00 天 | 无 |
| 1000 天 | 43200 s | 1000（封顶） | 499.50 天 | 有 |

- 单次上限 **1000 点**，超出需按 `continuation` 分页。
- 实测最早可回溯到 **2025-06-28**（499.5 天前）。
- ETH 同样可用。

### 7.4 历史 GEX 可重建性判定

GEX 需要三项历史数据：

| 输入 | 历史可得性 | 接口 |
| --- | --- | --- |
| 历史 OI（逐行权价） | ❌ **无** | 无任何接口 |
| 历史 IV（逐行权价） | ❌ **无**（最近仅 6 分钟） | `get_mark_price_history` 滚动缓存不够 |
| 历史 S（期货价） | ✅ 有 | `get_tradingview_chart_data`（实测可回溯 ≥ 30 天，1D 粒度 75 根） |
| 历史 IV 指数（DVOL） | ✅ 有（500+ 天） | `get_volatility_index_data` |

**结论**：
- **可以重建「DVOL 指数级别」的历史**（BTC/ETH 各一条 IV 曲线，500+ 天）。
- **不能重建「逐行权价 GEX / Gamma 翻转位 / Call-Put 墙」的历史**——缺历史 OI 和缺历史逐行权价 IV，这两项是 GEX 的分子。

**推断**：KCQ 若需要「Gamma 翻转位的历史变化」，**只能客户端自累积**——每次拉快照后存本地（IndexedDB），逐步积累。新装用户没有历史，只能从装上的那一刻开始积累。这是产品必须接受的上限。

### 7.5 官方文档佐证

[Options Data Collection](https://docs.deribit.com/articles/options-data-collection-best-practices) 明确写道：

> `public/get_book_summary_by_currency` with `kind=option` returns mark price, IV, volume, and open interest for every option in one REST call. **Use it for point-in-time reconciliation**, not as a substitute for the streaming channels.

> `get_volatility_index_data` (REST, candle-formatted): Deribit's DVOL index... Use the WebSocket channel for live DVOL, **the REST method for backfilling DVOL history**.

官方把 `book_summary` 定位为「时点对账用途」，明确不是历史数据源；而 `get_volatility_index_data` 被明确定位为「DVOL 历史回填」。

---

## 八、代理（实测）

### 8.1 结论：**必须走代理**

| 测试方式 | 结果 |
| --- | --- |
| 清除 `HTTP_PROXY`/`HTTPS_PROXY`/`NODE_USE_ENV_PROXY`/`ALL_PROXY` 后，用原生 `https` 直连 | ❌ **超时 20 s，随后 `ECONNRESET`（socket hang up，5.09 s）** |
| 走环境代理 `http://127.0.0.1:7078` | ✅ 稳定 200，1850 ms（冷）/ 300–1000 ms（热） |
| MSYS `curl` 走代理 | ❌ `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS` — 这是 **MSYS curl 的 schannel 后端问题，不是网络问题**；同一机器上用 Node `fetch` 走同一代理完全正常 |

### 8.2 环境事实

```
系统代理（注册表）：ProxyEnable = 1，ProxyServer = 127.0.0.1:7078
ProxyOverride = localhost;127.*;192.168.*;10.*;172.16-31.*;<local>
环境变量：HTTPS_PROXY = http://127.0.0.1:7078
          HTTP_PROXY  = http://127.0.0.1:7078
          NO_PROXY    = localhost,127.0.0.1,192.168.0.0/24,.local,::1,[::1]
```

`deribit.com` 不在 `NO_PROXY` 里，所以默认走代理。

### 8.3 对 KCQ 的含义（推断）

- **开发机**：必须走代理才能访问 Deribit。在 Node 侧（Electron 主进程）设置 `HTTPS_PROXY` 或显式指定 proxy agent。
- **终端用户**：用户的网络环境决定能否直连。欧洲/北美用户大概率可直连，中国大陆用户大概率需要代理。**这是产品级风险，不是开发环境细节**。
- **浏览器端直连**：浏览器不读环境变量，走系统代理。用户在系统里配了代理就能通；没配就连不上。KCQ 无法控制这一点。

---

## 九、本地算 GEX 需要的字段清单

### 9.1 必需字段（全部来自 `get_book_summary_by_currency`，一次请求）

| # | 字段 | 用途 | 实测覆盖 |
| --- | --- | --- | --- |
| 1 | `instrument_name` | 解析标的、到期日、行权价、Call/Put | 876/876 ✅ |
| 2 | `open_interest` | GEX 权重（持仓量） | 876/876 ✅ |
| 3 | `mark_iv` | 算 gamma 的波动率输入（**百分数**） | 876/876 ✅ |
| 4 | `underlying_price` | 该到期日的期货价（**S**，不是现货指数） | 876/876 ✅ |
| 5 | `mark_price` | 定价（`mid_price` 为 0 时唯一可用值） | 876/876 ✅ |
| 6 | `creation_timestamp` | 链的 source timestamp | 876/876 ✅ |

### 9.2 辅助字段（可选）

| 字段 | 用途 |
| --- | --- |
| `mid_price` | 流动性判断；39 张 BTC / 18 张 ETH 为 0，不可作主定价 |
| `volume` / `volume_usd` | 当日活跃度，用于过滤冷门行权价 |
| `bid_price` / `ask_price` | 买卖价差，判断该行权价的报价可信度 |
| `underlying_index` | 如 `BTC-27NOV26`，用于按到期日分组 |
| `interest_rate` | 实测全为 0；反向合约 BS 可省略 |

### 9.3 第二个请求：现货指数

```
GET https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd
→ {"result":{"estimated_delivery_price":74556.38,"index_price":74556.38}}
```

**用途**：±1σ 波动带、Gamma 翻转位通常以现货指数为中心，而 `underlying_price` 是各到期日的期货价（有基差）。

实测基差（BTC 指数 74,902）：

| 到期日 | 期货价 | 基差 |
| --- | --- | --- |
| BTC-27NOV26 | 75,135.92 | +233.88（+0.31%） |
| BTC-25DEC26 | 75,423.59 | +521.55（+0.70%） |
| BTC-29JAN27 | 75,814.51 | +912.47（+1.22%） |
| BTC-24SEP27 | 78,638.39 | +3,736.35（+4.99%） |

**推断**：算 GEX 时用 `underlying_price`（各到期日自己的期货价）是正确的——期权是挂在期货上的。但展示 ±1σ 带和翻转位时，若要和现货 K 线对齐，需要用 `get_index_price` 的现货价，并对基差做说明。**两者不能混用，会在长到期合约上产生 5% 的偏差。**

### 9.4 不需要的字段

- **`greeks`**：不需要，也不可得（见 §2.5）。本地自算 gamma 已验证与官方值一致。
- **逐合约 `ticker`**：不需要，876 次请求不可接受。

### 9.5 字段解析规则（实测确认）

`instrument_name` 格式：`{CUR}-{DD}{MON}{YY}-{STRIKE}-{C|P}`

```
BTC-27NOV26-73000-C  →  标的 BTC，到期 2026-11-27，行权价 73000，Call
```

- 到期时刻固定为 **08:00 UTC**（实测 11 个到期日全部验证通过；本机 CST 为 16:00）
- 876/876 条全部可被正则解析，无异常格式
- BTC 与 ETH 格式一致

端到端验证结果（BTC，实测）：

```
拉链 793 ms | 876 张 → 过滤后 455 张（0 < DTE ≤ 90）| 本地计算 <1 ms
现货指数 74,748.56 | 近月 ATM IV 39.63%（DTE 0.70）
净 GEX -45.64 M USD/1%
最大痛点 78,000
Call 墙 80,000（OI 11,171）| Put 墙 70,000（OI 9,289）
±1σ 预期波动 1,299.1 → [73,449, 76,048]
```

ETH 端到端（实测）：

```
拉链 532 ms | 746 张 → 过滤后 409 张 | 本地计算 <1 ms
现货指数 2,124.14 | 近月 ATM IV 54.9%
净 GEX -2.31 M USD/1% | 最大痛点 2,200
Call 墙 3,200（OI 69,911）| Put 墙 2,000（OI 77,401）
±1σ 预期波动 51.1 → [2,073, 2,175]
```

---

## 十、刷新节奏建议

### 10.1 决策依据（实测数据）

| 数据 | 变化速度 | 对 GEX 的影响 |
| --- | --- | --- |
| `open_interest` | 30 秒内变 ±0.9（占总 OI 0.0003%） | 极小 |
| `mark_iv` | 未直接测，但 `mark_price` 30 秒内合计变动 ±0.06 | 中等 |
| `mark_price` | 30 秒内明显变化 | 中等（影响 ATM 附近合约的 gamma） |
| `greeks` | 只能靠自算，随 IV 和 S 变化 | — |
| 现货指数 | 秒级跳动 | 大（gamma 对 S 敏感） |

**关键事实**：OI 是慢变量，价格/IV 是快变量。GEX = gamma × OI，gamma 随 IV 和 S 变化，所以 GEX 的变化主要由价格驱动。

补充依据：`get_mark_price_history` 显示单个合约的 mark price 约 **1 秒一个点**、缓存深度约 6 分钟——说明 Deribit 侧的估值刷新是秒级，但**这不构成 KCQ 必须秒级拉全链的理由**（全链 391 KB，秒级拉会放大流量 60 倍）。

### 10.2 建议节奏

| 标的 | 快照拉取间隔 | 理由 |
| --- | --- | --- |
| **BTC** | **30 ~ 60 秒** | 流动性最好，OI 和 IV 变化相对温和；30 秒足够反映 Gamma 翻转位的移动，60 秒对日内交易也够用 |
| **ETH** | **60 ~ 120 秒** | OI 总量是 BTC 的 4.4 倍但合约数更少（746 vs 876），单合约 OI 集中度高，变化更慢；拉到 2 分钟不会漏掉有意义的信号 |

### 10.3 分层刷新（推荐，推断）

不是所有字段都需要同一频率：

| 层 | 频率 | 内容 |
| --- | --- | --- |
| 静态层 | 启动时 1 次 + 每小时 1 次 | `get_instruments`（到期日、strike、合约规格）。官方文档明确：**不要每次重建合约清单**，用 `instrument.creation` / `instrument.state` 频道跟踪变化 |
| 快照层 | BTC 30–60 s / ETH 60–120 s | `get_book_summary_by_currency`（OI、IV、价格） |
| 现货层 | 跟随 K 线图表的 tick | `get_index_price`，或复用 KCQ 已有的行情源 |
| DVOL 层 | 5 分钟 1 次（可选） | `get_volatility_index_data`，作为 IV 环境背景 |

### 10.4 用户不可见时的降频

**推断**：期权链面板不可见时（切到其他 tab、窗口最小化），把间隔放大 5–10 倍（BTC 5 分钟、ETH 10 分钟）。每次拉取 391 KB，用户不看时不值得消耗流量。

### 10.5 不要做的事

- ❌ **不要用 WebSocket 做默认方案**：实测 `markprice.options.btc_usd` 首次推送就覆盖 869 个合约，8 秒内 17 条推送。带宽和解析成本远高于每分钟 1 次 REST。**REST 快照 + 本地计算是更简单的选择。**
- ❌ **不要逐合约调 `ticker` 拿 greeks**：876 次请求 / 44 秒。
- ❌ **不要指望 `get_instruments` 高频调用**：官方限流 1 req/s，且这是全链唯一的合约清单来源。
- ❌ **不要把 `get_mark_price_history` 当历史接口**：只有约 6 分钟滚动缓存。
- ❌ **不要用秒级时间戳调历史接口**：`get_mark_price_history` 与 `get_volatility_index_data` 都要求**毫秒**，传秒会静默返回 0 条而不是报错。

---

## 十一、风险与未知项

### 11.1 已确认的风险

| # | 风险 | 严重度 | 证据 |
| --- | --- | --- | --- |
| R1 | **没有历史 OI 与逐行权价 IV**，历史 Gamma 翻转位只能客户端自累积 | 高 | §7.4 |
| R2 | **中国大陆网络必须走代理**，普通用户可能完全连不上 | 高 | §8 直连超时 + ECONNRESET |
| R3 | `greeks` 字段缺失，必须自算 gamma；自算实现若与 Deribit 口径不一致会导致数值偏差 | 中 | §2.5 |
| R4 | `mid_price` 有 39/18 张为 0（只有卖单），误用会让这些合约的 GEX 归零 | 中 | §2.2 |
| R5 | `underlying_price` 是期货价不是现货价，与 K 线对齐时基差可达 5% | 中 | §9.3 |
| R6 | `mark_iv` 在 REST 是百分数、在 WS 是小数，混用会差 100 倍 | 中 | §2.3 |
| R7 | 历史接口要求毫秒时间戳，传秒会**静默返回 0 条**（不报错） | 中 | §7.2 / §7.3 |
| R8 | `creation_timestamp` 名字误导（实为快照时刻，非合约创建时刻） | 低 | §4.1 |
| R9 | 公开匿名请求按 IP 限流，阈值未公开，实际比文档的 20 req/s 更严 | 低 | §6.3 |
| R10 | `book_summary` 忽略 `expired` 参数，拿不到已到期合约的 OI | 低 | §7.1 |
| R11 | `kind=future` 等非法参数不报错，静默返回其他类型数据 | 低 | §6.4 |
| R12 | `get_instruments` 特例限流 1 req/s，启动时并发调用 BTC+ETH 会踩线 | 低 | §6.3 |

### 11.2 未确认项（需要进一步验证）

| # | 未知项 | 为什么重要 | 如何验证 |
| --- | --- | --- | --- |
| U1 | ~~`get_mark_price_history` 是否存在~~ | **已解决**：方法存在，但只有约 6 分钟滚动缓存，不是历史接口 | 见 §7.2 |
| U2 | 匿名公开请求的**实际 IP 限流阈值** | 决定多用户共用出口 IP（如公司 NAT）时会不会互相拖累 | 持续高频压测直到出现 429，记录阈值 |
| U3 | Deribit 对商业应用使用公开 API 的**条款限制** | 可能有「不得用于商业产品」的条款 | 读 [API Usage Policy](https://docs.deribit.com/articles/api-usage-policy) |
| U4 | `mark_iv` 为 0 或异常值的合约（本次实测 0 张） | 极端行情下可能出现，导致自算 gamma 除零 | 长期监控 |
| U5 | 期权链规模随市场增长的速度（876 → ?） | 影响响应体大小和解析耗时 | 长期观测 |
| U6 | 到期日切换（如 10NOV26 到期后）时链的连续性 | 影响 GEX 历史曲线的断点 | 观测一次到期事件 |
| U7 | `get_volatility_index_data` 的最早可用起点（实测到 499.5 天） | 决定 DVOL 历史能做多长回测 | 用 `continuation` 继续向前翻页 |

### 11.3 实施建议（推断，非事实）

1. **MVP 走 REST 快照**：`get_book_summary_by_currency` + `get_index_price`，两个请求，1.1 秒一轮。
2. **gamma 本地自算**，用反向合约 Black-76（公式已验证与官方一致）。
3. **不依赖 `greeks` 字段**，代码里不要留 `if (row.greeks)` 这类分支。
4. **历史数据从第一天起就在本地存**：每次快照落 IndexedDB，为将来的「Gamma 翻转位历史」积累数据。这是唯一可获得历史的方式。
5. **刷新间隔做成可配置**，默认 BTC 30 s / ETH 60 s，用户可调。
6. **代理不可控是产品级风险**：界面上要有明确的「无法连接 Deribit」提示，而不是转圈。
7. **时间戳统一用毫秒**：调任何 Deribit 历史接口前先确认单位，避免静默返回空数组。

---

## 十二、复现命令

以下命令在 `D:\AI\KCQ-NexusAI` 下运行，需要 Node.js ≥ 18（本机 v24.22.1）。**注意本机需要代理**（Node 会自动读 `HTTPS_PROXY`）。

```bash
# 1. BTC 全链快照（合约数、耗时、响应大小、是否有 greeks）
node -e "
const t0=Date.now();
fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option')
 .then(async r=>{const t=await r.text();const j=JSON.parse(t);
  console.log('status',r.status,'ms',Date.now()-t0,'bytes',t.length,'合约数',j.result.length);
  console.log('有 greeks 字段:', j.result.some(o=>'greeks' in o));});
"

# 2. ETH 全链快照
node -e "
fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=ETH&kind=option')
 .then(r=>r.json()).then(j=>console.log('ETH 合约数',j.result.length));
"

# 3. CORS 验证（带 Origin 看是否回显）
node -e "
fetch('https://www.deribit.com/api/v2/public/get_time',{headers:{Origin:'http://localhost:5173'}})
 .then(r=>console.log('ACAO =',r.headers.get('access-control-allow-origin')));
"

# 4. 单合约 greeks（证明只有 ticker 有）
node -e "
fetch('https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-27NOV26-73000-C')
 .then(r=>r.json()).then(j=>console.log('greeks =',JSON.stringify(j.result.greeks)));
"

# 5. 历史接口确认：get_option_mark_price_history 不存在
node -e "
fetch('https://www.deribit.com/api/v2/public/get_option_mark_price_history?instrument_name=BTC-27NOV26-73000-C&range=1d')
 .then(r=>r.json()).then(j=>console.log('应报 Method not found:',JSON.stringify(j.error)));
"

# 6. get_mark_price_history 只有约 6 分钟缓存（注意用毫秒时间戳）
node -e "
const n=Date.now(), inst='BTC-27NOV26-73000-C';
const u='https://www.deribit.com/api/v2/public/get_mark_price_history?instrument_name='+inst;
(async()=>{
 for(const [label,s,e] of [['最近10分钟',n-600000,n],['昨天同一时刻',n-86400000-600000,n-86400000]]){
   const j=await fetch(u+'&start_timestamp='+s+'&end_timestamp='+e).then(r=>r.json());
   const d=j.result||[];
   const span=d.length?((d[d.length-1][0]-d[0][0])/60000).toFixed(2):0;
   console.log(label,'→',d.length,'条，跨度',span,'分钟');
 }
})();
"

# 7. DVOL 历史可回溯多久（毫秒时间戳）
node -e "
const n=Date.now();
(async()=>{
 for(const [days,res] of [[30,3600],[365,43200],[1000,43200]]){
   const j=await fetch('https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp='+(n-days*86400000)+'&end_timestamp='+n+'&resolution='+res).then(r=>r.json());
   const d=(j.result&&j.result.data)||[];
   console.log(days+'天 res='+res+'s →',d.length,'点，首点',d.length?new Date(d[0][0]).toISOString():'-');
 }
})();
"

# 8. 直连测试（预期失败：超时或 ECONNRESET）
node -e "
for(const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','NODE_USE_ENV_PROXY','ALL_PROXY','all_proxy'])delete process.env[k];
const https=require('https');const t0=Date.now();
const req=https.get('https://www.deribit.com/api/v2/public/get_time',r=>console.log('直连 OK',r.statusCode,Date.now()-t0+'ms'));
req.on('error',e=>console.log('直连失败',e.code||e.name,Date.now()-t0+'ms'));
req.setTimeout(15000,()=>{req.destroy();console.log('直连超时 15s');});
"
```

---

## 十三、事实与推断的分界

**本文标注为「实测」的内容**：所有 HTTP 状态码、合约数、字段存在性、耗时数字、响应头、JSON-RPC 错误码、CORS 行为、限流压测结果、BS 反解验证、历史接口回溯深度、WebSocket 推送结构。这些都来自本次真实发出的请求。

**本文标注为「推断」的内容**：GEX 公式的具体系数选择、刷新间隔的合理性判断、对商业条款的推测、对用户网络环境的假设、实施建议的优先级排序。这些是基于实测数据的判断，不是可以直接验证的事实。

**已推翻的初始假设**（记录在案，避免后续误用）：
1. 最初以为 `get_option_mark_price_history` 是历史 IV 接口 → 实测不存在（`-32601`）。
2. 最初以为完全没有历史 mark price 接口 → 实测 `get_mark_price_history` 存在，但只有约 6 分钟滚动缓存。
3. 最初以为 DVOL 不可回溯 → 实测可回溯 499.5 天（需毫秒时间戳 + `continuation` 分页）。
4. 最初以为 `mid_price` 是 GEX 必需字段 → 实测 39/18 张为 0，应降级为辅助，改用 `mark_price`。

**未验证的内容**：U2–U7 列为未知项，不要在决策时当作已确认。

---

## 来源

- [Deribit API 文档首页](https://docs.deribit.com/)
- [Rate Limits（信用点制限流）](https://docs.deribit.com/articles/rate-limits)
- [Options Data Collection Best Practices](https://docs.deribit.com/articles/options-data-collection-best-practices)
- [API Usage Policy](https://docs.deribit.com/articles/api-usage-policy)（未读，列为 U3）
- 实测端点：`https://www.deribit.com/api/v2/public/get_book_summary_by_currency`、`/public/ticker`、`/public/get_instruments`、`/public/get_index_price`、`/public/get_mark_price_history`、`/public/get_volatility_index_data`、`/public/get_historical_volatility`、`/public/get_tradingview_chart_data`、`/public/get_last_trades_by_instrument`、`/public/get_delivery_prices`、`/public/get_time`
- 实测 WebSocket：`wss://www.deribit.com/ws/api/v2`（`markprice.options.btc_usd`、`ticker.{instrument}.100ms`）
