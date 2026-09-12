# 指标规范 ID 统一为展示名

## 背景

指标注册（`@Indicator` 装饰器）同时声明了两个标识：

- `name`：内部稳定键，用于 state key、renderer plugin 命名、计算配置 key。
- `displayName`：对外展示名。

此前这两者被不同层各自当作"指标身份"使用，形成两套 ID：

- 指标卡片（`indicatorCatalog`）用 `displayName.toUpperCase()`。
- 副图实例（`ChartIndicatorManager.addIndicator`）存 `name`。
- 主图实例存调用方传入值的大写形式（恰好等于 `name.toUpperCase()`）。

主图指标的 `name.toUpperCase() === displayName`，所以主图卡片能正常高亮；副图大量不一致（`stoch`/KDJ、`awesomeOscillator`/AO、`schaffTrendCycle`/STC、`ultimateOscillator`/UO、`volumeProfile`/VP、`fisherTransform`/Fisher），导致：

- 选择器 `isActive` 严格相等失败，副图卡片不高亮。
- 启用判断失败，重复启用会重复建 pane，且无法取消启用。
- 参数回显 key 对不上。

## 决策

**指标对外规范 ID = 注册 `displayName` 原样**，贯穿 Core、UI、Agent。

- `name` 降级为纯内部实现键，只用于 state key、renderer 命名、计算配置，不再作为对外身份。
- 提供唯一解析入口 `resolveIndicatorDefinitionId(nameOrAlias)`（`indicatorDefinitionRegistry.ts`），接受 `name` / `displayName` / 别名 / 大小写变体，返回规范展示名。

## 落地

- `indicatorDefinitionRegistry`：新增规范 ID 解析函数。
- `indicatorCatalog`：`Indicator.id = def.displayName`；`findIndicator` 兼容内部 name/别名输入。
- `ChartIndicatorManager`：主图白名单、默认参数、`addIndicator`/`removeIndicator`/`updateParams`、`setActiveMainIndicators` 全部基于规范 ID。
- `indicatorState`：主图实例不再 `toUpperCase()`；`restoreWorkspaces` 将历史快照的实例 ID 解析为展示名（持久化数据边界）。
- `scheduler`：volume 实例匹配改用 `displayName`。
- `createChartController`：`resolveSubPaneIndicatorId`、`replacePaneContent` 使用展示名；`catalog` 由 `allIndicatorDefinitions()` 从注册表派生，删除硬编码目录。
- 新增控制器层共享映射 `indicatorDefinitionCatalog.ts`，Vue 选择器直接复用。
- 测试断言统一到展示名（如 volume 实例 ID 为 `VOL`）。

## 不做

- 不改 state key / renderer plugin 命名 / 计算 `configKey`：它们是内部实现，仍基于 `name`。
