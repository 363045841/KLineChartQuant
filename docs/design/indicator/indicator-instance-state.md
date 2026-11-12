# 指标实例统一状态

## 决策

`indicatorState.instances` 是主图、副图指标实例的唯一状态来源。每个实例包含 `instanceId`、`indicatorId`、`paneId`、`role`、`ordinal` 与 `params`。

系统行情与辅助图层不属于指标，不进入实例状态，也不需要来源字段。

## 约束

- 所有实例按 `instanceId` 唯一；同一窗格可容纳多个指标实例。
- 主图实例的 `paneId` 为 `main`；移动命令原子更新归属与角色。
- 主副图共用生命周期，定义分类只决定添加时的默认位置。

## 读取与写入

`subPanes` 是从 `instances` 派生的只读 selector。公开实例命令统一经过 PaneManager，状态模块只接受已经解析完毕的变更。

实例归属与窗格布局通过 `batch()` 原子提交，订阅者不能观察到中间状态。

## 系统绘制

- 图表直接挂载系统 Layer，视图通过 `systemLayers` 声明可见图层。
- `setDataView()` 更新视图及活动工作区，不创建伪指标实例。

Core 主序列 Layer 只安装一次，可见性由视图状态派生，与指标目录无关。

切换视图保留各工作区中的指标配置与窗格布局。

## 投影

所有指标从同一实例集合进入计算、轴、标题与资源投影，不保存主副图各自的挂载配置副本。完整决策见 [指标实例的单向运行时投影](../indicator-instance-runtime.md)。
