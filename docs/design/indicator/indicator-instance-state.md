# 指标实例统一状态

## 决策

`indicatorState.instances` 是主图、副图指标实例以及 mode 自有序列实例的唯一状态来源。每个实例包含 `indicatorId`、`paneId`、`role` 与 `params`；不再由 `subPaneState` 单独保存副图指标。

用户实例与 mode 自有实例的区分由 `source` 表达：mode 自有实例带 `source: 'mode'`。

## 约束

- 主图实例的 `paneId` 固定为 `main`，按 `indicatorId` 唯一。
- 副图实例按 `paneId` 唯一，允许相同 `indicatorId` 出现在多个 pane。
- 新增主图实例排在全部副图实例之前，保持既有公开 `indicators` 信号的顺序。

## 兼容边界

`subPanes` 保留为从 `instances` 派生的只读 selector，供副图 pane 布局和框架绑定读取。主图 API 直接从 `instances` 按 `role: 'main'` 查询，全部变更只能通过 `indicatorState.actions`。

副图 create/remove/clear 仍在 `ChartStateKernel` 中与 pane layout 一起通过 `batch()` 执行，确保订阅者不会观察到指标实例与 pane layout 不一致的中间状态。

## Mode 实例投影

- `kline` 写入 `candle` 主实例。
- `timeshare` 只写入 `timeShare` 主实例。
- `ChartStateKernel.actions.setDataView()` 只更新 data view 与 mode 自有主实例，不创建、删除或重排用户指标 pane。

Core 主序列 Layer 只安装一次，可见性由 active 实例集合投影。`timeShare` renderer 只画价格线与均价线；volume renderer 拥有全部量柱，包括 `TimeShareData`。

用户指标 actions 保留 `source: 'mode'` 实例。切换视图只替换 mode 自有主实例；受支持的用户指标及其 pane 保持不变。

## 投影

`activeRenderers`、指标资源 reconcile 以及实例计算链路都从统一实例集合读取，并依据 `role` 区分主图和副图的渲染资源需求。这样 `dataView` 兼容性过滤与 renderer 名称解析只保留一条遍历路径。
