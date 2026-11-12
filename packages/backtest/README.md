# @363045841yyt/klinechart-backtest

KCQ 第一个回测引擎：验证「1h L2 信号 + 期权位 A/B 加分」是否有正期望。

## 第一版的边界

- **信号**：一目均衡表替身（KCQ 的 SMC 结构尚未实现）。L2 = regime 状态正确 + 价格在云的正确一侧 + TK 交叉。
- **三价规则（刻意简化，第二版换结构位）**：
  - 入场 = 信号 bar 收盘价
  - 止损 = 多头云下沿 `min(spanA, spanB)` / 空头云上沿 `max(spanA, spanB)`
  - 目标 = entry ± 2R（第一目标）/ ± 3R（第二目标，只记录是否到达）
- **结算**：high/low 触及判定；同一根 bar 同时触及时按止损处理；结局 `hit_target` / `hit_stop` / `invalidated` / `expired`。
- **成本**：零滑点、零手续费（第一版刻意）。
- **管理规则**：1R 保本 / 第一目标减半 / 结构追踪都未实现，`TradeRecord.managedOutcome` 恒为 `null`。
- **持仓**：每个信号独立结算，允许重叠；统计的是信号自身期望，不是资金曲线。

## 信号判定是单一实现

`src/impl/ichimoku.ts`（指标）+ `src/impl/evaluator.ts`（L2 判定）就是线上与回测共用的那份代码。
第一版暂放本包；**#13 正式接入时迁移到 `features/theory/ichimoku`**，回测改为调用迁移后的实现。

## 运行

```bash
# 默认读 temp/ichimoku-filter-eval/cache 的 1h K 线 + 正式目录的期权快照
pnpm exec tsx packages/backtest/src/cli.ts run

# 缓存缺失时从 Binance 拉取
pnpm exec tsx packages/backtest/src/cli.ts run --fetch

# 自定义输出与参数
pnpm exec tsx packages/backtest/src/cli.ts run --out temp/backtest-run --max-bars 200 --seed 42 --random-samples 1000
```

输出：`temp/backtest-run/report.json`、`report.md`、`trades.csv`。

## 交叉验证

运行时会读 `temp/ichimoku-filter-eval/signals.csv`，把引擎算出的全历史 L2 信号数与
report-v2 的记录逐条比对（BTC 1h = 1,395 笔 / 2.90 次每周，ETH 1h = 1,299 笔 / 2.70）。
任何一条对不上，报告的 `crossValidation.matched` 为 false，需要先查口径偏差再继续。
