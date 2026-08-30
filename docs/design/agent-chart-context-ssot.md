# Agent Chart Context SSOT

## 决策

图表上下文的唯一权威来源是 Core StateKernel。`ChartAgentController.context` 以只读 signal 形式投影当前标的、周期、时间范围和指标；没有有效行情数据时值为 `null`。

区间选择工具确认的范围写入 `interactionState.selectedRange`。Agent 上下文仅使用该范围；未选择时不提供范围，保证导出数据、Agent 展示和 Agent 查询使用同一份选择结果。

## 边界

Browser bridge 订阅该 signal，并仅将其格式化为 UI 展示模型。Vue Agent workspace 不在 reducer 中保存或修改图表上下文，因此不能用初始值、事件重放或局部写入覆盖图表状态。

`readOnly` 是单次 Agent 运行的权限策略，不属于图表上下文。它在 workspace 中独立保存，并在启动运行时作为 `StartRunInput` 传递。

## 后果

标的切换、周期切换、数据重载和视口变化都会经 StateKernel 自动重新计算，并通过 signal 触发界面更新。跨宿主实现 bridge 时必须订阅该只读投影，不能重新维护 `ChartContextView` 的可写副本。
