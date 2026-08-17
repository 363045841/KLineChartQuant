<!-- 多日分时前端存储与协议接入设计决策。 -->

# 多日分时存储设计

## 背景

GOTDX V1 的 `POST /api/v1/market-data/timeshare/range` 接受截止交易日和可配置的
`days`，返回按交易日升序排列的分时数据。每个交易日独立携带 `tradingDate`、
`preClose` 和 `items`；`days=5` 只是前端“五日分时”的一个查询预设。

## 协议边界

协议层新增通用 `fetchTimeShareRange`，请求字段与 GOTDX V1 保持一致：

- `endTradingDate` 包含在查询结果内。
- `days` 表示实际交易日数量，不是自然日数量。
- `requestedDays` 保留服务端实际接收的请求数量。
- `olderData` 明确历史边界状态。
- 单日 `fetchTimeShare` 保持不变，避免已有数据源被迫实现多日能力。

数据源和品种能力通过 `timeShareRange.maxTradingDays` 声明，UI 应只在能力存在且
上限不少于目标天数时展示对应入口。

## 存储决策

建议 Buffer 以分组结构作为多日分时的单一事实来源：

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

不应只存一条拼接后的 `TimeShareData[]`。跨日数据没有单一 `preClose`，扁平存储会
丢失每日涨跌基准和交易日边界，后续横轴、悬浮提示与增量更新都需要反向推断日期。

渲染层可从分组数据派生一次性的扁平投影，并为每个点附加 `dayIndex`、`slotIndex`
和对应日的 `preClose`。该投影只服务布局与绘制，不作为第二份可写业务状态。

## 后续接入

1. 在领域 Provider 中映射 `TimeShareRangeQuery` 与 `TimeShareRangeSeries`。
2. 让 `TimeShareBuffer` 保存分组 Range，并按 `instrument + endTradingDate + days` 区分缓存。
3. 五日模式使用 `days=5`，按五个交易日共享画布宽度，每日内部按 session slot 布局。
4. Y 轴基准策略在渲染设计阶段确定；分组存储保留每日 `preClose`，同时支持统一价格轴或逐日涨跌幅投影。
