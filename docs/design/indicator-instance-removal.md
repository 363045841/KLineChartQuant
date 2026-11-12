# 指标实例删除

## 决策

指标实例的所有删除路径统一收口到 `PaneManager`，状态层动作不再由其他模块直接调用：

- **单一删除原语**：`PaneManager.detachInstance(instanceId)` 同时删除实例状态与实例级轴偏好
  `instance:<id>`。布局提交仍由各命令在 `batch` 内完成，原语本身不重复提交布局。
- **批量删除共用一套回收规则**：`removeInstance`、`removeInstancesByDefinition`、
  `clearAllIndicators`、`clearPanes` 都通过 `removeInstances(instances)` 处理。只有被删实例
  占用的副图才会回收；仍有其它实例的 Pane、主图和系统 Pane 保持不动。
- **轴偏好键只有一处定义**：`indicatorInstanceAxisKey(instanceId)` 同时供 `axisResolver`
  生成轴身份和 `PaneManager` 清理偏好使用，避免两处各拼一次字符串。
- **定义注销走 Pane 命令**：`ChartIndicatorManager` 不再直接调用
  `indicator.actions.removeInstance`，改为依赖 `removeInstancesByDefinition`，使删除实例、
  回收空副图和清理轴偏好与其他删除路径一致。
- **Agent 与 UI 共用 facade**：`ChartAgentController` 依赖 `ChartPaneFacade` 而不是
  `PaneManager.actions`，删除、移动和清空自动带上绘图历史失效等宿主副作用。
- **为什么不放进 indicatorState**：轴偏好属于 pane 子状态，实例状态不应反向写 pane；
  跨子状态的清理必须由同时持有两者的 `PaneManager` 编排。

## 边界

- 实例删除只影响当前工作区；另一工作区的实例与布局不变。
- `moveInstance` 保留实例身份与轴偏好，只清理被回收的源 Pane 自己的轴偏好。

## 回归

- `chart.lifecycle` 覆盖 `clearAllIndicators` 删除主图/副图实例、回收副图并清理实例轴偏好。
- `chart.lifecycle` 覆盖 `removeInstancesByDefinition` 只删除匹配实例及其副图。
- `paneState` 的轴偏好增删用例保持通过。
