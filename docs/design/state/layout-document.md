# 图表布局文档

## 决策

图表的用户可控持久化配置统一为一份**版本化文档** `LayoutDocument`，契约定义在 `packages/core/src/engine/layout/types.ts`。此前分散在 `engine/state` 各模块的持久化快照类型（视图工作区、各 Pane 价格轴模式、可恢复视口位置）以及各自的持久化适配器接口，全部收敛到该模块，并从原位置删除。

## 背景

持久化此前是"每个功能一个 key、一份快照类型、一个适配器接口"：

- `kline-chart-view-workspaces`：`ViewWorkspaceSnapshot` / `ViewWorkspacesSnapshot` / `ViewWorkspacePersistence`；
- `kline-chart-pane-price-axis-modes`：`PanePriceAxisModesSnapshot` / `PanePriceAxisModePersistence`；
- 可恢复视口位置：`ViewportSnapshot`（内存，未落盘）。

类型散落在 `engine/state/viewWorkspace.ts` / `mainPriceAxisState.ts` / `dataManagerState.ts`，没有任何一处能回答"一张图的可持久化配置到底有哪些"。同时 `ChartSettings` 里混着图表级与应用级/设备级偏好。

## 文档形状

`LayoutDocument` 分节：

| 字段 | 内容 | 来源（原契约） |
|------|------|----------------|
| `version` | 文档版本号 | 新增 |
| `workspaces` | 各视图工作区的用户指标与 pane 布局 | `ViewWorkspacesSnapshot` |
| `panePriceAxisModes` | 各 Pane 价格轴自动/手动模式 | `PanePriceAxisModesSnapshot` |
| `settings?` | 图表级设置白名单子集 | `ChartSettings`（引用，不搬迁） |
| `drawings?` | 用户绘图文档 | `DrawingObject[]` |
| `viewport?` | 按 品种+周期+复权+数据视图 键的可恢复视口位置 | `ViewportSnapshot` |

持久化适配器接口统一为 `LayoutPersistence`（`schedule()` / `dispose()`），替代原先各自声明的两个接口。

## 边界

- **不进入文档**：应用级/设备级偏好（`rendererBackend`、`marketDataCacheMaxMiB`、`enableCanvasProfiler`）、自选列表、聚合源、Agent 设置；行情数据与运行时交互态同样不入文档。
- 本模块**只定义契约**（`types.ts`）与公开出口（`index.ts`）。序列化、存储、内核快照/恢复属于后续实现，放在同模块 `impl/` 下，`types.ts` 不依赖 `impl/`。
- `LayoutDocument.settings` 目前引用完整 `ChartSettings` 为 `Partial`；图表级与应用级的分层（`SettingItem.scope`）是后续步骤。
- 运行时状态 SSOT 仍是 `ChartStateKernel`，本次不搬迁状态，只集中持久化契约。

## 影响

- 删除 `engine/state/viewWorkspace.ts`；`mainPriceAxisState.ts` 移除 `PanePriceAxisModesSnapshot` / `PanePriceAxisModePersistence`；`dataManagerState.ts` 移除 `ViewportSnapshot`。
- 类型改名并归位：`ViewWorkspacesSnapshot` → `LayoutWorkspaces`，`ViewWorkspaceSnapshot` → `LayoutWorkspace`，`PanePriceAxisModesSnapshot` → `LayoutPanePriceAxisModes`，`ViewportSnapshot` → `LayoutViewportSnapshot`。
- 行为不变：`Chart`、`ChartStateKernel`、持久化适配器实现与既有 localStorage key 均保持原样，仅类型与导入路径变更。
- `engine/layout/types.ts` 与 `engine/state/indicatorState.ts` 之间存在 type-only 循环（`LayoutWorkspace.instances` 引用 `IndicatorInstanceInput`）。类型导入编译期擦除，运行期无环。

## 未纳入

- 具名布局仓库（IndexedDB `Record<id, LayoutDocument>`）、当前文档单一 key 的合并、旧 key 的一次性迁移。
- 内核 `snapshotLayoutDocument()` / `applyLayoutDocument()` 原子快照与恢复。
- TopToolbar 的布局管理入口与 Agent `@Tool`。

## 布局管理实现

TopToolbar 右侧新增独立竖线分组，使用 `DropMenu` 和商品选择同款 `symbol-chip` trigger。菜单包含保存、自动保存开关、创建新布局、布局列表；复制与重命名位于列表项右侧，只在 hover 或键盘焦点进入时展示。重命名在名称原位输入，Enter 提交、Esc 取消。

调用路径为 `LayoutMenu → useLayouts → ChartController → LayoutManager → ChartStateKernel`。布局管理不注册 Agent Tool（用户明确要求）。Controller 提供 `exportLayout` / `applyLayout`、具名文档 CRUD、`createLayout` 与 `setLayoutAutoSave`，同时提供布局摘要、活动身份、自动保存、未保存变更和保存错误的只读信号。

具名归档以 `LayoutArchive` 写入 IndexedDB：`documents` 为 `Record<id, NamedLayoutDocument>`，活动身份和自动保存偏好随文档一起提交。创建从默认图表设置和一个主窗格开始；复制当前布局会包含尚未保存的配置。默认布局和当前活动布局不能删除。

Kernel 在一个 batch 中恢复工作区、设置与价格轴模式，并重建当前视图的系统指标实例。设置序列化只选已声明的图表级白名单和颜色预设，不携带渲染后端、缓存上限或 profiler 开关。

Controller 订阅配置切片的真实变更；自动保存合并 600ms 内的连续操作。切换、页面离开和销毁时补写；恢复通知不回写。保存失败保留错误与未保存状态。列表顺序与自动保存偏好跨重新打开恢复。

此实现尚未迁移或删除既有零散 localStorage key；既有适配器保留至统一当前文档存储的迁移步骤。默认布局管理不携带绘图和数据视口，避免切换布局改动品种上的图元或行情位置。

## 列表顺序

布局列表按 `documents` 的插入顺序输出，即创建顺序：默认布局先建，其余布局随创建 / 复制依次追加，重命名与覆盖保存不改变位置。切换活动布局只更新身份，不重排列表，选中项停留在原位置。

此前归档额外维护 `recentIds`，切换时把活动布局提到最前，导致列表随选择跳动。该字段已从 `LayoutArchive` 与校验 schema 中删除；旧归档遗留的 `recentIds` 是多余键，校验允许额外属性，解码后不再参与排序，保存时自然被当前归档形状取代。

## 当前品种恢复

布局文档的 `currentSymbol` 保存主品种完整 `SymbolSpec`，包括统一品种描述、数据源、周期、复权和 Provider 路由参数。Kernel 从 `dataManager.currentSpec` 获取快照；Controller 恢复时调用现有 `setSymbols` 数据协调入口，保持行情加载、视图切换和实时订阅一致。配置与品种选择在一次 batch 中发布。

品种变化参与布局自动保存；新建布局沿用当前品种，复制布局保留来源文档的品种。旧文档缺少该字段时保留当前选择，显式 null 表示无品种。Vue 首次接线立即投影恢复后的名称和能力，初始 symbols props 仅在无已恢复选择时提供默认品种；之后 props 的显式变化继续通过受控入口生效。
