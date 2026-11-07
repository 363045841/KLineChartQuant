# 结构分析（SMC/ICT）契约设计

## 背景

KCQ 完全没有 SMC 结构能力：`packages/core/src/engine/renderers/` 只有 candle / gridLines / lastPrice 这类渲染件，脚本层 63 个内置脚本里只有 `structure.ts`（HH/HL/LH/LL + BOS/CHoCH）与 `zones.ts`（FVG/OB）覆盖了四个算子，`sweep` / `liquidity` / `killzone` / `premium-discount` / `po3` 全部为零。而 agent 要回答「通道被突破了，这是不是结构性反转」这类问题，必须先有结构事实。

同时存在一个更严重的既有问题：`packages/core/src/features/alerts/` 的事件只在收盘后评估（`chart.ts:1061` 用 `latest.timestamp` 去重），所以 agent 的认知永远比市场晚一根 K 线。用户明确要求「盘中就要能反应，且随着收盘临近，结论要收敛」——这是本次设计的原始驱动力。

## 决策

### 一、五份契约，而不是一个大 `MarketStructure`

拆成 `StructureSnapshot` / `ChannelState` / `BreachAssessment` / `VolumeClock` / `ThresholdProfile`，并且**把裁决结果 `BreachVerdictResult` 单独拎出来**。

理由：这五份的生命周期不同。
- `StructureSnapshot` 只在**收盘 bar 序列**变化时增量更新（确认过的枢轴永不回改），可以缓存。
- `VolumeClock` 每帧都在变（成交量在流进来）。
- `BreachAssessment` 是两者在某一时刻的快照，不缓存。
- `ThresholdProfile` 是按品种×周期的配置，跨会话持久化，与行情无关。

合成一个对象会让「缓存粒度」无法表达：要么全部每帧重算（浪费），要么全部缓存（量钟会僵死）。

裁决结果单独拎出的理由更硬：**同一份事实在不同阈值下会得到不同裁决**，而回测必须同时保留「当时看到的」与「当时判成了什么」，否则阈值调优无法归因。

### 二、每个派生事实都带 `confirmedBarIndex`

`StructurePivot` 与 `StructureBreak` 都有 `barIndex`（价格所在处）+ `confirmedBarIndex`（足以确认的那根 bar）。两者必然满足 `confirmedBarIndex >= barIndex`。

这是对 `smart-money-concepts` 三个 open issue 的直接规避：
- **#101**：`swing_highs_lows()` 用 `ohlc["high"].shift(-(swing_length // 2)).rolling(swing_length).max()`，即居中窗口。实测（XAUUSD M15，十年 280k bars）centered window 得 177 笔 / 胜率 81.4% / PF **7.32**，改成 confirm-bars 后 106 笔 / 52.8% / PF **1.82**。我们绝不能出 PF 7 那种数字。
- **#114**：`bos_choch` 的 `BrokenIndex` 实际上要等 11 根之后才可知，因为事件依赖「事件之后形成的摆动点」。我们的 `StructureBreak.barIndex` 定义为**收盘越过枢轴价的那根 bar**，影线穿越不算，因此该 bar 收盘即确认，无未来数据。
- **#93**：流式数据下 OB 会先生成在错误位置再变化。我们的 `StructureZone` 带 `confirmedBarIndex`，且 `state` 只允许单向推进（active → mitigated → invalidated），落定后不回退。

### 三、判据与阈值严格分离

判据（`BreachEvidence` 的六项：越界深度、收盘越界、位移倍数、失衡、反向结构破坏、回抽）**只描述「看到什么」**，全部是原始值或布尔，不含任何「够不够」的判断。

阈值（`ThresholdProfile`）**只描述「多少算够」**，是唯一允许被滚动优化引擎自动调整的层。

这个切分带来两个后果，都是我们要的：
1. 引擎永远改不了「看什么」，只能改「看多少」——这比任何正则化都强的结构性保障。
2. 回测可以在**同一套事实**上切换多组阈值做对照，事实层的计算成本只付一次。

### 四、不用 ATR，用通道高度当尺度

所有归一化量都用 `ChannelState.height` 或 `ChannelState.averageBarRange` 当分母：
- `BreachEvidence.depthRatio = 越界深度 / channelHeight`
- `ChannelState.heightRatio = channelHeight / averageBarRange`
- `BreachRetest.proximityRatio = 回抽距离 / channelHeight`

理由：通道高度是**这条通道自己的天然尺度**，同类比较不需要跨品种校准；而 ATR 是全局平均，在趋势行情里会系统性滞后（趋势中 ATR 被放大，导致「深突破」看起来很浅）。用户明确说「ATR 也是传统方案了」，这个决策就是对它的响应。

### 五、量钟代替墙上时间，波动率从量价关系里出

`VolumeClock` 用「已成交量 ÷ 该时段期望成交量」当进度，而不是墙上时间。

关键收益：`remaining`（剩余进度）与 `sigmaPerUnitVolume`（单位进度对应的价格波动）直接进概率闭式解：

```
P(收盘越界) = Φ(-d / (σ · √τ))
P(盘中触及) = 2 · Φ(-|d| / (σ · √τ))
```

`τ → 0` 时概率收敛到 0 或 1，正是用户说的「1 小时 K 线到了最后 1 分钟基本就确定了」。**不需要模拟、不需要蒙特卡洛、不会抖动。**

为什么不用墙上时间：同样差 1 分钟收盘，凌晨 3 点与纽约开盘前的信息量差一个数量级。用成交量当钟，信息量被隐式归一化了。

`source` 字段记录估计来源（`historicalProfile` / `sessionProfile` / `liveOnly`），`sufficient` 为 false 时调用方必须退回墙上时间口径并在结论里声明——不允许静默降级。

### 六、两个概率分开，不合并

`BreachProbability.closeBeyond` 与 `touchBeyond` 是两个量级差约 2 倍的量（触及是单边穿越，收盘是终点位置）。混用会让「假突破」与「真突破」的判据互相污染：用 touchBeyond 判假突破会严重高估，用 closeBeyond 判「是否曾触及」会漏掉全部影线越界。

`method` 字段记录时钟口径，回测切片对比时需要它。

### 七、跨品种参考是一等公民字段，而不是外部约定

`BreachAssessment.crossInstrument: CrossInstrumentConfirmation | null`，其中 `agreement` 四档（aligned / partial / conflict / unavailable）+ `adjustment`（-1..1）+ `note`（人类可读一句话）。

用户的要求：「主品种是 BTCUSDT，但疑似反转时要对比 BTCUSDT.P，一致则信心更高，反之亦然。」

标识口径：主品种 = `binance:spot:BTCUSDT`，参考品种 = `binance:perp:BTCUSDT`。`BTCUSDT.P` 是 TradingView 的展示写法，**不进入标识**（展示时由 `formatInstrumentLabel` 从 `providerRef.market` 生成），规则见 `docs/design/data/instrument-identity.md`。

设计要点：
- `unavailable` 不是 `conflict`：参考品种数据拿不到时**不得降低信心**，只允许原样返回并在 `note` 里说明。否则网络抖动会变成交易信号。
- `baseConfidence` 与 `combinedConfidence` 并存：前者是纯结构判据的原始信心，后者叠加跨品种调整。回测可以分别看两者的表现，从而验证「跨品种参考到底有没有用」——这个结论现在没人有数据，必须让引擎自己测出来。
- `adjustment` 是数值而非枚举，因为一致性强度是连续的（参考品种可能只是「没有反向」而不是「明确同向」）。

### 八、`PriceBand` 而不是 `PriceRange`

`engine/scale/impl/scale_Y/price.ts:3` 已有一个 `PriceRange = { maxPrice, minPrice }`（坐标轴显示区间）。两者语义不同，同名会在 `packages/core/src/index.ts` 的聚合导出里冲突。本模块用 `PriceBand = { lower, upper }`。

## 备选方案与否决理由

**A. 直接把 `smart-money-concepts` 的 Python 逻辑照搬成 TS**
否决。除了 look-ahead（#101）与延迟确认（#114）两个致命问题外，它的 OB 实现是照 "Volumized Order Blocks | Flux Charts" 做的（#14），不是通用 OB finder；输出还大量为 NaN（#68）。只能借算法思想，不能借实现。

**B. 用 Python sidecar 保留 cloudtrade 的 `smc_engine.py`（140KB / 95 键 / 35 算子）**
否决。违反 KCQ 的「禁止第二份状态副本」原则（`docs/fragments/_agent-native.zh-CN.md:13` 明确否决 MCP 桥接层，理由就是「桥接层自身维护状态副本、侵入前端逻辑」）。而且盘中断言需要毫秒级响应，跨进程会引入不可控延迟。

**C. 塞进指标层（`@Indicator` + Layer）**
否决。指标层的执行链是 `instanceCalculationScheduler.ts:45-75 compute()`，每次 `dataRevision` 变化都 `executor.setData()` + `execute(plan)`，即全量重算。盘中每帧触发不可接受。结构层必须独立、只增量更新尾部几根。

**D. 用居中窗口换更准的枢轴（即 `SMC` 库的做法）**
否决。这是用未来数据换回测好看，属于欺骗自己。`confirmedBarIndex >= barIndex` 是硬约束，宁可枢轴晚几根确认。

**E. 一次性把 95 个算子全做**
否决。`SMC reforge` 的量化评估给出了明确顺序：96 份档案里 42 份用 A+B1+C 三档就兜住，其余 54 份需要 B2/B3 算子。第一版只做六条判据所需的算子（枢轴、BOS/CHoCH、FVG/OB、位移、回抽），其余按实测需求增量补。

## 影响

- 新增 `packages/core/src/features/structure/`（`types.ts` + `index.ts`），并在 `packages/core/src/index.ts` 导出。
- 不改动任何既有模块：`features/alerts/` 保持原样（结构层将作为它的**事件源**接入，而不是替换它）。
- 后续实现落点：`features/structure/impl/`（`pivots.ts`、`breaks.ts`、`zones.ts`、`channel.ts`、`volumeClock.ts`、`breach.ts`、`thresholds.ts`）。

## 验证

契约层本身只能验证「可编译 + 不冲突」：
- `pnpm type-check:src` 必须为 0；
- `pnpm build:packages` 后 `dist/features/structure/index.d.ts` 存在且无重复导出（`PriceRange` 冲突已通过改名 `PriceBand` 规避）。

行为验证留给实现期，判据是 `SMC reforge` 已有的实测基准：事件胜率 5m 59.8% / 15m 63.5% / 1h 56.8% / 4h 60.5% / 1d 64.6%（同向随机入场基线 48–50%）。任何一档显著低于该基准，说明实现有 look-ahead 或确认时机错误。
