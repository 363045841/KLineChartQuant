# 指标规范 ID：原生用展示名，脚本用稳定 ID

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

**原生/内置指标对外规范 ID = 注册 `displayName` 原样**，贯穿 Core、UI、Agent。**脚本指标例外：规范 ID = 稳定内部 `name`（宿主分配的 `script_<uuid>`），`displayName` 只是可编辑展示名。**

- `name` 对原生定义是纯内部实现键，只用于 state key、renderer 命名、计算配置，不再作为对外身份。
- 提供唯一解析入口 `resolveIndicatorDefinitionId(nameOrAlias)`（`indicatorDefinitionRegistry.ts`），接受 `name` / `displayName` / 别名 / 大小写变体，返回规范 ID；底层统一走 `resolveCanonicalIndicatorId(descriptor)`。

## 脚本定义：稳定 ID 优于可编辑展示名

脚本源码只声明 `name`（展示名），宿主为其分配稳定 ID（`IndicatorDefinition.id`）。若仍以 `displayName` 作身份，用户改名会连带改变实例、收藏、布局与启用状态的 key，历史数据全部失联。

- `registerPlotIndicator`：内部 name 取 `definition.id ?? definition.name`，pane ID 与 renderer 工厂同步使用内部 name；`displayName` 与 `scale.label` 仍取 `definition.name`。
- `resolveCanonicalIndicatorId`：`source === 'script'` 时返回 `descriptor.name`，否则返回 `displayName`；`indicatorCatalog`、`ChartIndicatorManager`、`chartStateKernel`、控制器全部改用它取身份。
- `updateIndicatorDefinition`：脚本内部 `name` 与 `aliases` 不可变（改名即拒绝），仅允许改 `displayName`；改名时按新身份集清理不再归属本定义的旧展示名索引键，并对新展示名做别名冲突校验。
- 内置脚本没有宿主 ID，内部 name 即其框架 ID，规范 ID 保持不变。

## 实现

- `indicatorDefinitionRegistry`：新增 `resolveCanonicalIndicatorId`，规范 ID 解析函数改走它；`updateIndicatorDefinition` 允许脚本改展示名并清理旧别名。
- `registerPlotIndicator`：内部 name = `id ?? name`。
- `indicatorCatalog`：`Indicator.id = resolveCanonicalIndicatorId(def)`；`findIndicator` 兼容内部 name/别名输入。
- `ChartIndicatorManager`：主图白名单、默认参数、`addIndicator`/`removeIndicator`/`updateParams`、`setActiveMainIndicators` 全部基于规范 ID。
- `indicatorState`：主图实例不再 `toUpperCase()`；`restoreWorkspaces` 将历史快照的实例 ID 解析为规范 ID（持久化数据边界）。
- `scheduler`：volume 实例匹配改用规范 ID。
- `createChartController`：`resolveSubPaneIndicatorId`、`replacePaneContent` 使用规范 ID；`catalog` 由 `allIndicatorDefinitions()` 从注册表派生，删除硬编码目录。
- 新增控制器层共享映射 `indicatorDefinitionCatalog.ts`，Vue 选择器直接复用。
- 测试断言统一到规范 ID。

## 不做

- 不改 state key / renderer plugin 命名 / 计算 `configKey`：它们是内部实现，仍基于 `name`。
