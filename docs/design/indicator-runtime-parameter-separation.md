<!-- 本文说明指标计算参数、展示配置与结果所属方的分层决策。 -->

# 指标 Runtime 参数分层

## 问题

旧模型把 `period`、`multiplier` 等 calculator 参数与 `showCCI`、`showDIF` 等展示开关共同放在
`runtime.defaultConfig`。这会让展示变更触发 Worker 计算，也使 Agent 查询层只能通过运行时过滤
猜测哪些字段是计算参数。

## 决策

每个指标定义使用两个互不重叠的配置入口：

- `runtime.defaultParams`：只包含影响 calculator 输出的参数，发送给 Inline Runtime 和 Worker。
- `presentation.defaultOptions`：只包含 renderer 展示选项，仅在主线程生成 `renderStates` 时合入。

Chart 和 Agent 均调用同一个 `runtime.compute(data, params)`。Runtime 和 Worker 不接收调用方身份；
纯计算结果返回主线程后，提交层再根据请求上下文附加 `owner: chart | agent`。

```text
Chart instance / Agent request
  -> runtime.defaultParams + 参数覆盖
  -> runtime.compute
  -> 纯计算结果
  -> 主线程附加 owner
  -> 共享结果池
```

## 状态与版本

`indicatorState.configRevision` 只在实例身份或 `runtime.defaultParams` 对应字段变化时递增。展示选项
变化仍会发布新的实例快照，但只重建 renderer 投影，不执行 calculator，也不增加结果版本。

Scheduler 为兼容现有 UI 输入暂时保留一份合并配置快照，但边界明确：发送给 Runtime/Worker 前只
提取 `defaultParams` 声明的字段；生成渲染投影时才把 `defaultOptions` 合入临时 render bundle。
业务结果 bundle 和实例结果不保存展示配置。

Worker 描述符字段由 `defaultConfig` 改为 `defaultParams`，协议版本同步升级为 4，避免新旧主线程与
Worker 对配置边界产生不同解释。

## 多序列指标

MA 和 RSI 不再根据展示开关决定是否计算某条序列。calculator 始终产生参数指定的完整序列，
`presentation.selectSeriesKeys` 只在 renderer 投影中选择可见序列。这样相同数据与计算参数始终得到
相同业务结果，不受界面显隐状态影响。

## Agent 参数

Agent MVP 只允许覆盖 `runtime.defaultParams` 中默认值为有限数字的字段。未知字段、展示字段和
非数字计算字段均拒绝。返回 DTO 中的 `params` 是合并默认值后的数字计算参数，不需要从混合配置
中过滤展示开关。
