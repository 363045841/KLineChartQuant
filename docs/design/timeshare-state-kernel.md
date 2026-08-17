<!-- 多日分时状态归属与单一快照设计决策。 -->

# 分时状态 Kernel 归属

## 决策

当前图表使用的分时业务状态归 StateKernel 的 data state 管理。Buffer 只负责请求、重试、
取消和按品种缓存，不作为第二个业务状态内核。

活动 Buffer 的状态通过一次 `applyActiveBufferSnapshot` Action 发布，快照包含：

- 活动 Buffer key
- 扁平渲染数据
- loading 状态
- 多日 Range
- 当前分时昨收基准

Kernel 内部只保存一个活动快照 signal。`data`、`loading`、`activeBufferKey`、Range 和
`preClose` 都是该 signal 的 computed 投影。

## 原因

同时保存 Range、扁平数组、时间窗口和昨收会产生手动同步路径。新增增量加载或异步切换
后，任何遗漏都会使渲染数据、Tooltip 元数据和状态标识观察到不同版本。

`TimeShareBuffer` 内部同样只保存一个判别联合内容快照：`empty`、`inline` 或 `range`。
扁平数据和加载窗口从该快照派生，不能再引入独立 writable 缓存。

## 边界

Kernel 不持有网络请求对象、重试计时器或所有品种的缓存。非活动 Buffer 可以继续存在于
`ChartDataManager`，但激活时必须以完整快照原子同步到 Kernel。
