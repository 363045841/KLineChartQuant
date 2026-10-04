# 对比视图

## 决策

`comparison` 是与 `kline`、`timeshare` 互斥的 `ChartMode`。它只展示对比集合中若干品种（各自归一化为相对自身基准的涨跌幅）的折线，不区分主品种。

## 状态职责

`mode.dataView` 决定当前显示的图表视图、主图 renderer 和交互能力。`comparison` 子状态负责对比品种集合（`specs`）、颜色和加载状态，不承担当前视图选择。

极值标记是由 `@Indicator({ dataViews: ['kline'] })` 声明的 mode 辅助 renderer。它参与 `activeRenderers$` 投影，但不进入用户指标实例或主图图例。

## 无主品种概念

对比视图没有“主品种”。对比品种集合 `comparisonState.specs` 是唯一业务状态，所有序列在渲染、y 轴范围和图例中一律平等：

- 首序列 `specs[0]` 仅作为横轴时间索引与百分比基准的**参考序列**（`ChartDataManager.getComparisonReferenceData`），没有视觉或图例特权。
- `comparisonLine` 为集合中每个已加载品种各画一条折线；集合为空则不绘制。
- `getComparisonViewLineRange` 只遍历对比集合的等价价极值，不读取 kline 主品种数据。
- 图例 `collectComparisonRows` 只列出对比集合成员，不再追加主品种行。
- 参考序列的 bar 数经 `comparisonState.referenceLength` 驱动 `dataLength$`，使没有 kline 主品种时仍能计算可见区间。

## 切换规则

对比集合非空时进入 `comparison`，清空时恢复 `kline`。视图激活由 `comparisonState.active`（`specs.length > 0`）驱动，既不依赖 kline `symbols.length > 1`，也不依赖主品种是否存在。分时数据不进入对比模式。

## 主品种进入对比视图的路径

kline 主品种要出现在对比视图，必须由调用方把它作为普通序列显式加入对比集合。UI 侧：首次添加对比商品时，`KLineChart` 把当前 kline 主品种经 `addComparisonSymbol` 推入集合，之后切换主品种时把集合中原本的主品种条目替换为新品种。core 不读取 kline 主品种来构造对比集合。

## 写原语：ComparisonCommands

`ComparisonCommands` 是对比品种的唯一写原语，实现 `ComparisonCommandsApi`，依赖 `ComparisonCommandsDependencies`。它用 `create` / `remove` / `clear` / `list` 统一处理对比品种、比较视图切换与重绘。

对比品种写入 `kernel.comparison.actions.setSpecs`（`comparisonState.specs` 是唯一 SSOT），不写入 `dataState.symbols`，也不由 kline symbols 尾部派生。原语移除品种后，`ComparisonManager` 对 `comparison.readonly.specs` 的既有订阅会自动重算对比 buffer。

主品种由调用方显式传入 `primary`，原语不通过 `getSymbols()[0]` 隐式读取 kline 状态，因此无主品种时工具链同样可用。新增对比的品种信息由原语保留：`add(SymbolSpec, primary)` 接收 UI 搜索得到的完整 spec，仅对缺失字段用 `primary` 补齐，不丢弃 `id` / `instrument` / `params`；`create` 面向只给品种代码的 Agent，工具 schema 带可选 `primary` 字段，调用前经依赖注入的 `resolveInstrument` 从活动数据源目录解析出真实 `exchange` / `id` / `sessionId` / `params`，绝不继承 `primary` 的交易所。原语在 `setSpecs` 前先经 `registerSpec` 把品种登记进 `data.symbolCatalog`，UI 与 Agent 都无需在调用前后手工补状态。

`primary` 只用于补齐对比品种自身缺省的路由字段，不作为“主品种”进入对比渲染。对比集合是唯一展示集合；kline 主品种要出现在对比视图，必须由调用方把它作为普通序列经 `add` 显式加入集合。`Chart` 另提供 `setComparisonSpecs` 供 UI 整体写回集合，`Chart.setSymbols` 只写 kline 主品种。

## 品种解析与失败语义

`resolveInstrument` 返回 `ComparisonInstrumentResolution`：命中返回完整品种；未命中时携带本次查询的 `searchedSourceIds`，若限定源为空则跨全部已启用源复查一次，并用 `foundElsewhereSourceIds` 指出代码实际所在的数据源，便于提示 Agent 换源重试。

`create` 返回判别联合 `ComparisonCreateResult`：

- 成功：`{ status: 'added', symbol, name }`。
- 多候选：`{ status: 'ambiguous', candidates }`，不写入任何状态。裁决策略收归 `ComparisonCommands`，`resolveInstrument` 只汇报全部候选，core 层没有替用户拍板的逻辑；歧义处置见[对比标的歧义裁决与 Ask Question 工具](comparison-ambiguity-ask-user.md)。
- 解析失败或品种已存在：抛出携带具名 `KLineChartError` 码（`INSTRUMENT_NOT_FOUND` / `COMPARISON_DUPLICATE`）与可操作 message 的错误，而不是静默返回 `false`——Agent 侧 `recoverableToolFailure` 只把异常 message 透传为可自纠正反馈，返回值 `false` 不携带原因。`add` 作为 UI/程序化同步入口保留 boolean 语义。

## 轴与刻度

比较视图的百分比轴由模型驱动，不写用户偏好：轴标签由渲染器按 `comparisonActive` 经 `resolveEffectiveAxisDisplay` 强制 percent，pane 刻度由 `setComparisonViewActive` 投影。用户偏好 `mainRightAxisTypeSetting` 不因进入比较视图而改变（与分时视图一致），因此不再需要 UI 侧的 `forcePercentAxis`。

## 工具注册

`@Tool` 直接标注在原语方法上：`comparisons_list`、`comparison_create`、`comparison_remove`、`comparisons_clear`。`Chart.comparisonCommands` 是唯一实例，`ChartController` 与 Agent 共用。

Agent runtime 通过 `ChartAgentController.toolHosts` 找到原语实例作为工具执行目标。`@Tool` 在装饰时自动记录真实方法名与函数引用，bridge 据此按函数身份认领宿主，未命中原语宿主时回退到 Agent facade，不再按工具名查找方法。`Tool` 注册表迁到 `foundation/agent/chartToolRegistry`，使 engine 原语与 agent facade 都能安全引用，避免 engine 反向依赖 features。

## 边界与后果

- 新增对比品种写能力只能经 `ComparisonCommands`，不得再在 `Chart` 或 `ChartDataManager` 复制选择拼装。
- UI 不得在调用原语前后手工 `registerSymbols` 或写 `mainRightAxisTypeSetting`；品种登记与视图刻度副作用的唯一归属是原语。
- `ChartDataManager` 不再持有 add/remove 选择逻辑，仅保留对比数据注入与 runtime 投影（`ComparisonManager`）。
- UI 与 Agent 调用同一实例，行为一致；工具随原语模块加载注册。
- 对比写入不做市场会话校验：会话只在分时消费，详见 `docs/design/session/market-session-scope.md`。
- `dataState.symbols` 只承载 kline 主品种；对比品种唯一状态是 `comparisonState.specs`。
- 对比视图没有主品种：渲染、y 轴范围、图例一律以对比集合为唯一展示集合，`specs[0]` 仅作参考序列。
- 无主品种时 `comparison_create` 不得因缺少主品种而失败。
