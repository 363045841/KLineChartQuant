# @363045841yyt/klinechart-analytics

KCQ 分析数据业务线的采集器：Deribit 期权链聚合位 + Binance 买卖量拆分 + cloudtrade 历史迁移。

与图表数据通路（Binance-Connector → core）完全分离：本包不依赖 `packages/core`，不改 `Binance-Connector`，
只在 Node 侧把数据拉到桌面端数据目录，供后续分析消费。

## 三条数据线

| 层 | 数据 | 频率 | 保留 |
| --- | --- | --- | --- |
| L1 | 期权聚合位：净 GEX、Gamma 翻转位、Call/Put 墙、最大痛点、±1σ、现货 | 30–60 秒 | 永久 |
| L2 | Binance 买卖量拆分：taker buy base / sell = volume − buy | 跟 K 线刷新（1m…1M） | 短周期 90 天，日线及以上永久 |
| L3 | 期权原始链：instrument_name、strike、expiry、OI、mark_iv、mark_price、underlying_price | 5 分钟 | 90 天滚动 |

## 关键口径

- **gamma 本地自算**：Deribit 全链快照不含 `greeks` 字段，用 `mark_iv` 代入反向合约 Black-76 反算；
  实测与官方逐合约 `ticker.greeks.gamma` 一致（比值 0.999–1.044）。
- **过滤规则**：`0 < DTE ≤ 90` 且 `open_interest > 0`。零持仓合约对 GEX、墙位、最大痛点没有贡献，
  只会把统计张数撑大（参考快照 876 张 → 按 DTE 过滤 568 张 → 再加 OI 过滤 456 张）。
- **净 GEX**：`gamma × OI × 1 张 × 现货指数² × 0.01`，call 记正、put 记负，单位 USD/1%。
- **±1σ**：`现货 × 近月 ATM IV × √(近月 DTE / 365)`。
- **买卖量守恒**：`takerBuyBaseVolume + (volume − takerBuyBaseVolume) == volume`，
  相对容差 1e-12 覆盖 double 舍入噪声（quote 量级 1e7 时一个 ULP 约 4e-9）。
- **只落已收盘 K 线**：币安返回的最后一根还在增长，写进去会被 openTime 去重永久卡住。

## 存储布局

```
<数据目录>/
  options/aggregate/{BTC|ETH}/YYYY-MM-DD.jsonl.gz     # L1 聚合位，永久
  options/chain/{BTC|ETH}/YYYY-MM-DD.jsonl.gz         # L3 原始链，90 天滚动
  volume/{BTCUSDT|ETHUSDT}/{interval}/YYYY-MM-DD.jsonl.gz
  legacy/options-levels/{BTCUSD|ETHUSD}/YYYY-MM-DD.jsonl.gz   # cloudtrade 迁移
  legacy/volume/{BTCUSDT|ETHUSDT}/{interval}/YYYY-MM-DD.jsonl.gz
  legacy/MANIFEST.json                                # 迁移清单与采样口径说明
```

数据目录默认是桌面端 userData 下的 `analytics/`：
Windows `%APPDATA%\KLineChart Quant\analytics`，macOS `~/Library/Application Support/KLineChart Quant/analytics`。

迁移数据单独放在 `legacy/` 子树：cloudtrade 聚合位是非等间隔快照（实测间隔中位约 16 分钟、p90 约 64 分钟），
不能当统计样本，因此不与实时流混存。

## 运行

```bash
# 期权聚合位（默认走本机代理 127.0.0.1:7078；本机直连 Deribit 会超时后 ECONNRESET）
pnpm exec tsx packages/analytics/src/cli.ts collect-options --currencies BTC,ETH

# 同时落原始链
pnpm exec tsx packages/analytics/src/cli.ts collect-options --currencies BTC,ETH --with-chain

# 买卖量（默认直连币安，可加 --proxy host:port）
pnpm exec tsx packages/analytics/src/cli.ts collect-volume --symbols BTCUSDT,ETHUSDT \
  --intervals 1m,5m,15m,1h,4h,1d --limit 500

# cloudtrade 历史迁移（幂等，可重复执行）
pnpm exec tsx packages/analytics/src/cli.ts migrate-cloudtrade

# 单元测试
pnpm --filter @363045841yyt/klinechart-analytics test
```

`--root <dir>` 可覆盖数据目录；`--repeat-seconds <n>` 让采集器按间隔循环，Ctrl+C 退出。
周期性调度由外部承担（桌面端定时器或系统计划任务），不在本包内实现。

## 错误处理

所有失败都抛 `AnalyticsError`，带稳定错误码（见 `src/errors.ts`）。代理不可用、超时、非 2xx、
买卖量不守恒、读回不一致都会立即报错并给出上下文，不会静默转圈。
