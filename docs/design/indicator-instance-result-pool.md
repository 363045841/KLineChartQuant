<!-- 本文说明 Pre-D 指标实例结果池的数据模型与边界决策。 -->

# 指标实例结果池设计

## 背景

`IndicatorSeriesBundle` 按指标定义保存计算结果，适合作为现有 renderer 投影的输入，但无法表达同一定义的多个实例。图表业务状态已经以 `indicatorState.instances` 维护稳定 `instanceId`，Pre-D 将该实例快照接入计算链路，建立图表渲染使用的事实源。

**行情数据：** 指当前图表活动数据 buffer 中按时间排序的 K 线序列，包括 `timestamp`、`open`、`high`、`low`、`close`、`volume` 及其已有扩展字段。加载、切换、追加或更新这组序列都会形成新的 `dataRevision`；指标结果必须记录其对应的 revision，避免将基于旧行情计算的结果解释为当前行情结果。

## 决策

`commitResults` 只接收图表 Scheduler 的提交，原子写入图表实例结果、时间轴、legacy `bundle` 和
`renderStates`。结果池是渲染中间状态，不保存 Agent 临时计算结果。

Worker 和 Inline 使用相同的实例计算输入与输出结构。该改动不修改 calculator 算法，也不改变 renderer 从帧级 `IndicatorRenderStateReader` 读取投影的原则。

## 提交快照

状态快照将图表渲染提交和结果池分开保存，但图表计算仍通过一次 Action 原子更新两者：

```text
snapshot = {
  committed: {
    dataRevision,
    configRevision,
    resultVersion,
    projectionVersion,
    bundle,
    renderStates
  },
  pool: {
    dataRevision,
    timestamps,
    results: Map<instanceId, instanceResult>
  }
}
```

`timestamps[index]` 与实例时间序列的 `series[index]` 对齐。实例结果保存规范化的 `definitionId`、`paneId`、合并默认值后的参数、原始 calculator 输出和 `firstReadyIndex`。

## 结果身份

结果池以稳定 `instanceId` 索引图表实例结果。Worker 只返回纯计算结果，Scheduler 在一次图表提交中将其写入
结果池。每项结果包含规范化 `definitionId`、真实 `paneId`、合并默认值后的参数、原始 calculator 输出和
`firstReadyIndex`，可参与生成 renderer 投影。

Agent 查询不再写入结果池：它调用同一注册 Runtime 取得纯计算结果后直接转义为文本。因此 Agent 不伪造图表
实例或 pane 身份，也不会影响图表的 revision、结果版本或渲染状态。

## Worker 动态协议

Worker 配置和兼容结果包均按指标注册表的 `configKey` 动态索引。具体参数字段由各指标定义和 renderer 状态约束，Worker 协议不枚举所有指标配置，也不硬编码指标结果键。新增指标只需注册 runtime descriptor 和对应投影逻辑，无需扩展 Worker 的 Config、Bundle 或 Snapshot 联合结构。

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
3. 图表时间轴、实例结果、revision 和 resultVersion 必须原子提交。
4. 过期 request 不得覆盖当前 attempt 或 committed 结果。
5. 失败保留最近成功结果，但 availability 必须为 error 或 stale。
6. 结果池时间轴、实例结果、参数和序列在运行时均不可修改。

计算输出由 Scheduler 在 commit 时向 State 转移所有权并原地递归冻结。这样不会为长历史序列创建第二份完整副本；提交后 Runtime、Scheduler 和调用方均只能读取该对象图。

## D 轮边界

D 轮 Agent 查询使用完整活动 K 线调用注册定义的 Runtime，取得纯计算结果后直接构造紧凑文本。它不读取或
写入 `IndicatorResultPoolSnapshot`、`bundle`、`renderStates`、PluginHost 或 Scheduler 私有缓存。
