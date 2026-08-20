# 指标结果 Kernel 状态

## 背景

指标实例和参数已由 `kernel.indicator` 管理，但计算结果此前由 `IndicatorScheduler` 私有缓存，并通过 `PluginHost.StateStore` 传递给渲染器。这使结果版本、计算状态和 Agent 可读取状态不属于同一业务状态体系。

## 决策

新增 `kernel.indicatorResult`，其快照包含：

- `status`：`idle`、`computing`、`ready` 或 `error`
- `dataVersion` 与 `configVersion`
- 单调递增的 `resultVersion`
- 最近一次成功的完整 `IndicatorSeriesBundle`
- 按既有 renderer `stateKey` 索引的 `renderStates`
- 最近一次计算错误

Scheduler 只持有 Worker、Inline Runtime、请求序号和计算输入等执行态。Worker 或 Inline Runtime 完成后，Scheduler 用一次 Action 提交完整结果和渲染投影；不会直接触发 renderer 绘制。

## 渲染链路

ChartRenderer 在每帧开始时创建 `IndicatorRenderStateReader`，并通过 `RenderContext` 传给
renderer。renderer 按 `stateKey` 读取当前帧绑定的 `renderStates` 快照。PluginHost
`StateStore` 只用于非指标插件和独立 Scheduler 的兼容投影。

Kernel 状态提交后由 Scheduler 调用 `scheduleDraw`。Renderer 在下一帧读取结果快照，因此同一帧内的指标渲染使用同一版本。

## 可见范围变化

可见范围变化不触发 Worker 重新计算。Scheduler 从最近成功的 bundle 重建 `renderStates` 中的可见区派生字段，再更新 Kernel 投影；`resultVersion` 保持不变。

## 兼容边界

独立创建 `IndicatorScheduler` 时，如果调用方显式注入 PluginHost，Scheduler 会在 Kernel 提交后将结果投影给该 Host。这是独立调度器场景的适配层，不参与 Chart 运行路径，也不作为指标结果的事实源。
