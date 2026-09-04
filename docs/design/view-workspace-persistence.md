# 视图工作区持久化

## 决策

K 线与分时工作区的用户配置使用 `localStorage` 持久化，键名为
`kline-chart-view-workspaces`。存储内容是完整 workspace 快照，仅包括用户指标、pane 布局比例和坐标轴类型；
mode 管理的主序列、行情数据、viewport 与 renderer 实例均不保存。

## 写入与恢复

`createChartController` 在创建 `Chart` 前同步读取快照，再作为 kernel 初始状态注入，避免首帧默认布局闪烁。
JSON 损坏时直接使用默认布局。

用户通过指标或 pane 的语义入口变更工作区时，`Chart` 调用持久化适配器调度保存。适配器以
1 秒 trailing debounce 合并连续变更；`pagehide` 和 Chart 销毁时仅在有待写入变更时立即补写。

## 边界

StateKernel 仍是业务状态 SSOT，只提供完整快照的恢复与读取。浏览器存储、定时器和页面事件
只存在于 controller 层适配器中；读取异常或配额不足均降级为默认内存状态，不影响图表运行。

## Runtime 启动阶段

Chart 构造阶段只建立 kernel、Scene、layout 与 manager 依赖。所有运行时依赖就绪后，
`Chart.startRuntime()` 统一启动指标 projection、viewport、活跃 Layer 投影和首帧绘制。
`ChartIndicatorManager.start()` 首先从完整 kernel snapshot 投影 pane、renderer 与 scheduler，
再订阅后续状态变更；因此恢复快照与运行时用户操作经过同一条 reconcile 链路。
