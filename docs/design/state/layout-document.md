# 图表布局文档

图表布局是可命名、可切换、可跨会话恢复的用户配置快照。契约在
`packages/core/src/engine/layout/types.ts`，存储与恢复实现在同模块 `impl/`，出口为 `index.ts`。

## LayoutDocument

界面可控配置的唯一持久化载体。字段：

| 字段 | 内容 |
|------|------|
| `version` | 文档版本号，恢复时据此迁移 |
| `currentSymbol?` | 主品种完整 `SymbolSpec`（数据源、周期、复权、路由参数）；省略时保留当前选择 |
| `workspaces` | K 线与分时两个视图的用户指标和 pane 布局 |
| `panePriceAxisModes` | 各 pane 价格轴的自动 / 手动模式 |
| `settings?` | 图表级设置白名单子集 |
| `drawings?` | 用户绘图；省略表示不携带 |
| `viewport?` | 按 品种+周期+复权+视图 键的可恢复视口位置 |

不进入文档：应用级 / 设备级偏好（渲染后端、缓存上限、profiler 开关）、自选列表、聚合源、
Agent 设置，以及行情数据与运行时交互态。运行时状态 SSOT 仍是 `ChartStateKernel`，
本文档只负责持久化边界。

## 归档与生命周期

`LayoutManager` 把具名文档写入 IndexedDB，归档形状为 `LayoutArchive`：
`documents`（`Record<id, NamedLayoutDocument>`）、`activeId`、`autoSave`。

- 首个文档为 `default`（默认布局）；删除默认布局或当前活动布局会被拒绝。
- 创建从默认图表设置和单主窗格开始；复制包含当前尚未保存的配置和来源文档的品种。
- 保存覆盖当前归档，身份与名称不变。
- 自动保存合并 600ms 内的连续变更，并在切换、页面离开、销毁前补写；恢复产生的通知不回写。
- 恢复在一次 batch 中写回工作区、设置与价格轴模式，并重建当前视图的系统指标实例；
  保存失败保留错误与未保存状态。

## 列表顺序

列表按 `documents` 的插入顺序输出：默认布局先建，其余随创建 / 复制依次追加，重命名与覆盖
保存不改变位置；切换活动布局只更新身份，不重排列表。

## 视口位置

`viewport` 是每个 品种+周期+复权+视图 各自记住的 K 线视口：`anchorTimestamp`（可见区左缘 K
线时间）、`anchorOffsetPx`（相对该锚点的像素偏移）、`zoomLevel`（缩放档位）。

- 导出文档前先捕获当前视图，因此活动布局总带着最新滚动与缩放位置；其余键保留会话内访问过的
  品种位置。
- 恢复布局时整表替换，切到对应品种 / 周期后按锚点还原滚动与缩放；文档未携带视口时视为空表，
  避免沿用上一份布局的内存位置。
- 滚动、缩放会标记布局未保存并进入自动保存；分时视图不产生快照。

## UI 入口

`TopToolbar` 的布局分组经 `LayoutMenu → useLayouts → ChartController → LayoutManager →
ChartStateKernel` 接入。菜单含保存布局、自动保存开关、创建新布局和布局列表；复制、重命名在
列表项右侧，删除前就地确认。创建、复制、重命名共用基于 `BaseModal` 的 `LayoutNameDialog`
输入名称。布局管理不注册 Agent Tool。

## 当前品种

`currentSymbol` 保存主品种的完整 `SymbolSpec`。恢复时 Controller 通过现有的 `setSymbols`
数据协调入口写回，使行情加载、视图切换与实时订阅保持一致，配置与品种选择在一次 batch 中
发布。品种变化参与自动保存；新建布局沿用当前品种，复制布局保留来源品种；旧文档缺少该字段
时保留当前选择，显式 `null` 表示无品种。
