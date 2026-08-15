# 指标实例统一状态

## 决策

`indicatorState.instances` 是主图和副图指标实例的唯一状态来源。每个实例包含 `indicatorId`、`paneId`、`role` 与 `params`；不再由 `subPaneState` 单独保存副图指标。

## 约束

- 主图实例的 `paneId` 固定为 `main`，按 `indicatorId` 唯一。
- 副图实例按 `paneId` 唯一，允许相同 `indicatorId` 出现在多个 pane。
- 新增主图实例排在全部副图实例之前，保持既有公开 `indicators` 信号的顺序。

## 兼容边界

`subPanes` 保留为从 `instances` 派生的只读 selector，供副图 pane 布局和框架绑定读取。主图 API 直接从 `instances` 按 `role: 'main'` 查询，全部变更只能通过 `indicatorState.actions`。

副图 create/remove/clear 仍在 `ChartStateKernel` 中与 pane layout 一起通过 `batch()` 执行，确保订阅者不会观察到指标实例与 pane layout 不一致的中间状态。

## 投影

`activeRenderers`、指标资源 reconcile 以及 scheduler 都从统一实例集合读取，并依据 `role` 区分主图和副图的渲染资源需求。这样 `dataView` 兼容性过滤与 renderer 名称解析只保留一条遍历路径。
