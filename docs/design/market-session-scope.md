# Market Session 的消费边界

## 背景

`MarketSessionRegistry` 的职责是市场交易时段：时区与开收盘区间。它唯一真正的消费者是分时视图——用于计算一天的槽位数量、时间轴刻度与 bar 坐标。

`ComparisonCommands` 引入统一写原语时，把 `resolveSymbolMarketSession` 借来当"市场合法性校验器"，对所有周期的对比写入都硬校验；`Chart.configureModeForSpec` 也无条件解析会话。这带来两个问题：

1. 把 **market 身份**与 **trading session** 焊死：没有交易时段的数据源（如 MT5 这类券商接入平台）被当成"未知 market"拒绝。
2. 校验实际拦不到东西：对比 spec 来自搜索目录或 Agent 解析，已带真实 `sessionId`；`market` 也不参与数据路由，写错只会让身份 key 不同。

## 决策

会话解析只属于分时。非分时路径不再要求 `market` 能解析为已注册会话。

- 删除 `ComparisonCommandsDependencies.validateSpec` 及其在 `write` 中的调用，删除 Chart 侧接线。
- `Chart.configureModeForSpec` 只在 `isTimeSharePeriod` 时解析会话。
- 分时的合法消费点保持不变：`Chart.setSymbols`（分时主品种）、`configureCurrentTimeShareSession`、`configureModeForSpec` 的分时分支、`chartStateKernel.sessionSlots$`。

## 概念区分

- **market 身份**：`SymbolSpec.market`，进入 `symbolIdentityKey`，所有品种必须非空且稳定。
- **trading session**：时区 + 开收盘区间，只有分时消费。

数据源是否声明会话取决于它是否支持分时，而不是它是否需要 market 身份。因此不能用"market 能否解析"判断一个品种是否合法。

## 影响

- MT5 等无交易时段的数据源可直接参与对比，无需往 Chart 实例注册表塞假会话。
- Provider 侧仍用自己声明的会话解析 `timeZone`（`getInstrumentTimeZone`），那是另一份注册表实例，与 Chart 实例注册表无关；本次不改。
- 既有测试中锁定"未知 market 一律拒绝"的日线用例（对比写入、`resetToFetcher`）随行为变更删除。
- 分时的未知 market 仍会显式抛错（如 `applyCustomData` 传入未知 market 的分时数据）。

## 后果

- 新增对比写入不得重新引入市场合法性硬校验。
- 若未来确需校验市场，应以真正消费会话的功能为边界，而不是在写入口做通用校验。
