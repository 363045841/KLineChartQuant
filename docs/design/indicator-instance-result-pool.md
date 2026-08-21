<!-- 本文说明 Pre-D 指标实例结果池的数据模型与边界决策。 -->

# 指标实例结果池设计

## 背景

`IndicatorSeriesBundle` 按指标定义保存计算结果，适合作为现有 renderer 投影的输入，但无法表达同一定义的多个实例。图表业务状态已经以 `indicatorState.instances` 维护稳定 `instanceId`，Pre-D 将该实例快照接入计算链路，建立后续 Agent 查询使用的事实源。

## 决策

一次 Scheduler 计算同时产生两类输出，并通过一次 `commitResults` 原子提交：

- `bundle`：保留按指标定义组织的 legacy 结果，仅供现有 render state 投影使用。
- `results`：按 `instanceId` 索引的业务结果，每个实例使用自己的参数独立调用既有 calculator。

Worker 和 Inline 使用相同的实例计算输入与输出结构。该改动不修改 calculator 算法，也不改变 renderer 从帧级 `IndicatorRenderStateReader` 读取投影的原则。

## 提交快照

已提交快照包含：

```text
committed = {
  dataRevision,
  configRevision,
  resultVersion,
  projectionVersion,
  timestamps,
  results: Map<instanceId, instanceResult>,
  bundle,
  renderStates
}
```

`timestamps[index]` 与实例时间序列的 `series[index]` 对齐。实例结果保存规范化的 `definitionId`、`paneId`、合并默认值后的参数、原始 calculator 输出和 `firstReadyIndex`。

`firstReadyIndex` 仅从 `outputAlignment: bar` 且长度等于行情数组长度的序列推导。Structure、Zones 和 Volume Profile 显式声明为 `aggregate`，其内部数组不与 K 线逐项对齐，因此 `firstReadyIndex` 为 `null`。

## 状态语义

- `ready`：最近提交结果的 data/config revision 与当前 Kernel 一致。
- `computing`：当前 revision 正在计算，最近成功结果可保留但不能标记为 ready。
- `error`：当前 revision 计算失败，最近成功结果可保留但不能标记为 ready。
- `stale`：没有当前 revision 的成功结果，也没有对应的 computing/error attempt。

warm-up 范围为 `[0, firstReadyIndex)`。该范围中的稀疏数组项保持 `undefined`；跨 Worker 或 JSON 边界序列化时自然表现为 `null`。Pre-D 不在内部事实源中提前转换 DTO 空值。

## 不变式

1. 实例身份只来自 `indicatorState.instances`，查询层不得按 pane 或参数猜测归属。
2. 同类型多实例必须使用各自参数产生独立序列。
3. 时间轴、实例结果、revision 和 resultVersion 必须原子提交。
4. 过期 request 不得覆盖当前 attempt 或 committed 结果。
5. 失败保留最近成功结果，但 availability 必须为 error 或 stale。
6. committed 时间轴、实例结果、参数和序列在运行时均不可修改。

计算输出由 Scheduler 在 commit 时向 State 转移所有权并原地递归冻结。这样不会为长历史序列创建第二份完整副本；提交后 Runtime、Scheduler 和调用方均只能读取该对象图。

## D 轮边界

D 轮只从 `CommittedIndicatorResult.results` 和 `timestamps` 构造受限 DTO。它不读取 `bundle`、`renderStates`、PluginHost 或 Scheduler 私有缓存。
