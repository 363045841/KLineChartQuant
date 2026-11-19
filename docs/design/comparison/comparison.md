# 对比折线

## 决策

对比不是独立的 `ChartDataView`：它是 K 线视图上的叠加层。`comparisonState.active`（对比集合非空）只决定是否注册对比折线层、是否把主图右轴切成百分比，不改变 `dataView`，也不与 `kline` / `timeshare` 互斥。

主图始终是基准：主 K 线按原始 OHLC 绘制，参与共同价格范围；对比品种按各自在可见区间内首个有效收盘归一化为涨跌幅折线。主图不在对比集合里。

## 状态职责

`comparisonState.specs` 是对比品种的唯一业务状态，写入 `kernel.comparison.actions.setSpecs`，不写入 `dataState.symbols`。同一子状态持有派生的 `active`、颜色、显隐与加载状态：

- `active` 由 `specs.length > 0` 派生，用于注册对比层和切换百分比轴。
- `colors` 随 `setSpecs` 原子同步；读取方按 identity 取色。
- `hidden` 只影响折线可见性，保留选择与数据；用户与 Agent 都通过同一个写入口修改。

## 主图与对比折线

`ChartDataManager.getComparisonProjection()` 调用 `projectComparison(primary, data, range, centers, scrollLeft, paneWidth, hidden)`：

- 以主图时间轴为横轴，对比数据按时间戳对齐主图可见区间。
- 每个对比序列在自己的首个有效收盘处归一化，缺口不画线。
- 主图可见 OHLC 与对比折线共同决定价格范围。
- 对比层只由功能集合派生，不注册成图表模式或指标实例。

UI 添加对比时只提交被选中的品种；`primary` 只用于补齐路由字段，不进入对比集合。切换主品种不会增删对比集合。

## 周期与复权

对比线恒随主图当前周期与复权。取数前由 `ChartDataManager.comparisonSpecForPrimary()` 把主图的 `period` / `adjust` 注入对比 spec；对比 spec 本身不保存这两项，Agent 与 UI 因此没有第二套口径。

## 写原语：ComparisonCommands

`ComparisonCommands` 实现 `ComparisonCommandsApi`，是 UI 与 Agent 共用的唯一写入口：

- `list()`：身份、完整 spec、颜色与可见性。
- `create(input, signal?)`：按 `symbol / source? / exchange? / instrumentType?` 解析并写入；Agent 路径。
- `add(spec, primary?)`：接受宿主已解析的完整 `SymbolSpec`；图例与程序化入口使用。
- `setVisible(identity, visible)`：与图例开关共用，不能绕过。
- `remove(target)`：按 identity 删除；保留按品种代码删除以兼容公开的 `ChartController`。
- 不提供 `clear()`：UI 没有对应入口，Agent 不应拥有用户没有的能力。

写入顺序固定为 `registerSpec` → `setSpecs` → `scheduleDraw`，重复品种直接返回冲突项，不写任何状态。

## 品种解析与失败语义

`resolveInstrument` 返回 `ComparisonInstrumentResolution`：

- `candidates`：本次查询范围内的精确匹配。
- `searchedSources`：实际参与查询的源。
- `foundElsewhereSources`：被 `source` 限定排除、但存在该代码的其他源。
- `failedSources`：查询失败的源。

`create` 返回判别联合 `ComparisonCreateResult`：

- 成功：`{ status: 'added', comparison }`，`comparison` 带身份、颜色与可见性。
- 多候选：`{ status: 'ambiguous', candidates }`，不写入任何状态；候选只含 `symbol / name / exchange / source / instrumentType`，可原样回传给 `create`。歧义处置见[对比标的歧义裁决与 Ask Question 工具](comparison-ambiguity-ask-user.md)。
- 零候选：`INSTRUMENT_NOT_FOUND`，区分“过滤器排除”“其他源存在”“彻底没有”。
- 有源失败且零候选：`FETCH_FAILED`，不把“没查成”报成“不存在”。
- 重复品种：`COMPARISON_DUPLICATE`，`details` 带回既有 identity。

## 轴与刻度

对比激活时，主图右轴按百分比显示，由帧上下文 `comparisonActive` 驱动；用户偏好 `mainRightAxisTypeSetting` 与分时视图一样不被改写。轴标签由 `resolveEffectiveAxisDisplay` 统一决定，不再需要 UI 侧强制。

## 工具注册

`comparisons_list` 与 `comparisons_write`（create / update / remove）声明在 `features/agent/tools`，由 `createChartToolCatalog` 一次组装。Agent 只依赖窄命令面（列表、创建、显隐、删除），不直接拿 `ComparisonCommandsApi` 的宿主写原语。契约细节见 [对比品种工具契约](../agent/agent-comparison-tools.md)，装配见 [Agent 工具目录](../agent/agent-tool-catalog.md)。

## 边界与后果

- 对比写能力只能经 `ComparisonCommands`；`Chart` 与 `ChartDataManager` 不复制选择拼装。
- UI 不在原语前后手工 `registerSymbols`，也不写轴设置；登记与重绘归属原语。
- `ChartDataManager` 只保留对比数据注入与投影（`ComparisonManager` / `comparisonProjection`）。
- 对比写入不做市场会话校验：会话只在分时消费，见 `docs/design/session/market-session-scope.md`。
- `dataState.symbols` 只承载 K 线主品种；对比品种唯一状态是 `comparisonState.specs`。
- 对比写入不依赖 K 线主品种是否存在。
