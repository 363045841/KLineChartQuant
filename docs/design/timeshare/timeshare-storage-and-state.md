# 分时存储与状态

## 背景

GOTDX V1 的 `POST /api/v1/market-data/timeshare/range` 接受截止交易日和可配置的 `days`，返回按交易日升序排列的分时数据。每个交易日独立携带 `tradingDate`、`preClose` 和 `items`；`days=5` 只是前端“五日分时”的一个查询预设。

## 协议边界

协议层新增通用 `fetchTimeShareRange`，请求字段与 GOTDX V1 保持一致：

- `endTradingDate` 包含在查询结果内。
- `days` 表示实际交易日数量，不是自然日数量。
- `requestedDays` 保留服务端实际接收的请求数量。
- `olderData` 明确历史边界状态。
- 单日 `fetchTimeShare` 保持不变，避免已有数据源被迫实现多日能力。

数据源和品种能力通过 `timeShareRange.maxTradingDays` 声明，UI 应只在能力存在且上限不少于目标天数时展示对应入口。

## 存储决策

活动分时状态以一个不可变内容快照作为单一事实来源：

```ts
interface TimeShareDay {
  tradingDate: TradingDate
  preClose: number | null
  data: ReadonlyArray<TimeShareData>
}

interface TimeShareRange {
  instrumentId: string
  timezone: string
  requestedDays: number
  days: ReadonlyArray<TimeShareDay>
  olderData: OlderDataStatus
}
```

Range 与旧单日数据通过判别联合区分。不得同时维护 Range、扁平数组、时间窗口和昨收等相互同步的 writable 字段。跨日数据没有单一 `preClose`，因此每日基准必须保留在 Range 内部。

`TimeShareBuffer` 内部同样只保存一个判别联合内容快照：`empty`、`inline` 或 `range`。扁平数据和加载窗口从该快照派生，不能再引入独立 writable 缓存。

## Kernel 归属

当前图表使用的分时业务状态归 StateKernel 的 data state 管理。Buffer 只负责请求、重试、取消和按品种缓存，不作为第二个业务状态内核。

活动 Buffer 的状态通过一次 `applyActiveBufferSnapshot` Action 发布，快照包含：

- 当前序列选择（`selection`，Kernel 只读投影为 `activeSelection`）
- 扁平渲染数据
- loading 状态
- 多日 Range
- 当前分时昨收基准

Kernel 内部只保存一个活动快照 signal。`data`、`loading`、`activeSelection`、Range 和 `preClose` 都是该 signal 的 computed 投影。

原因：同时保存 Range、扁平数组、时间窗口和昨收会产生手动同步路径。新增增量加载或异步切换后，任何遗漏都会使渲染数据、Tooltip 元数据和状态标识观察到不同版本。

## 边界

Kernel 不持有网络请求对象、重试计时器或所有品种的缓存。非活动 Buffer 可以继续存在于 `ChartDataManager`，但激活时必须以完整快照原子同步到 Kernel。

## 后续接入

1. 在领域 Provider 中映射 `TimeShareRangeQuery` 与 `TimeShareRangeSeries`。
2. 按 `instrument + endTradingDate + days` 区分多日分时缓存。
3. 五日模式使用 `days=5`，按五个交易日共享画布宽度，每日内部按 session slot 布局。
4. Y 轴采用统一绝对价格轴，最新交易日 `preClose` 作为右侧涨跌幅参考；每日 `preClose` 继续用于 Tooltip 的当日涨跌计算。
