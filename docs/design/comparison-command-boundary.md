# Comparison Command Boundary

## Context

对比品种此前没有统一写入口：symbols 选择拼装散落在 `ChartDataManager`，视图与刻度副作用散落在 `Chart`，Agent 侧没有任何工具，旧 `ai-runtime` 又另有一套 add/remove 语义。

## Decision

`ComparisonCommands` 是对比品种的唯一写原语，实现 `ComparisonCommandsApi`，依赖 `ComparisonCommandsDependencies`。它用 `create` / `remove` / `clear` / `list` 统一处理 symbols 选择、比较视图切换与重绘。

选择仍写入 `kernel.actions.setSymbols`，`comparisonState.specs` 继续由 symbols 尾部派生，不新增可写 specs action，也不产生第二份业务状态。原语移除选择后，`ChartDataManager` 对 `comparison.readonly.specs` 的既有订阅会自动重算对比 buffer。

新增对比的品种信息由原语保留：`add(SymbolSpec)` 接收 UI 搜索得到的完整 spec，仅对缺失字段用主品种补齐，不再丢弃 `id` / `instrument` / `params`；`create` 面向只给品种代码的 Agent，调用前经依赖注入的 `resolveInstrument` 从活动数据源目录解析出真实 `exchange` / `id` / `sessionId` / `params`，绝不继承主品种的交易所。原语在写入 symbols 前先经 `registerSpec` 把品种登记进 `data.symbolCatalog`，UI 与 Agent 都无需在调用前后手工补状态。

`resolveInstrument` 返回 `ComparisonInstrumentResolution`：命中返回完整品种；未命中时携带本次查询的 `searchedSourceIds`，若限定源为空则跨全部已启用源复查一次，并用 `foundElsewhereSourceIds` 指出代码实际所在的数据源，便于提示 Agent 换源重试。`create` 在缺少主品种、解析失败、或品种已存在时抛出携带具名 `KLineChartError` 码（`COMPARISON_NO_PRIMARY` / `INSTRUMENT_NOT_FOUND` / `COMPARISON_DUPLICATE`）与可操作 message 的错误，而不是静默返回 `false`——Agent 侧 `recoverableToolFailure` 只把异常 message 透传为可自纠正反馈，返回值 `false` 不携带原因。`add` 作为 UI/程序化同步入口保留 boolean 语义。

比较视图的百分比轴由模型驱动，不写用户偏好：轴标签由渲染器按 `comparisonActive` 经 `resolveEffectiveAxisDisplay` 强制 percent，pane 刻度由 `setComparisonViewActive` 投影。用户偏好 `mainRightAxisTypeSetting` 不因进入比较视图而改变（与分时视图一致），因此不再需要 UI 侧的 `forcePercentAxis`。

`@Tool` 直接标注在原语方法上：`comparisons_list`、`comparison_create`、`comparison_remove`、`comparisons_clear`。`Chart.comparisonCommands` 是唯一实例，`ChartController` 与 Agent 共用。

Agent runtime 通过 `ChartAgentController.toolHosts` 找到原语实例作为工具执行目标。`@Tool` 在装饰时自动记录真实方法名与函数引用，bridge 据此按函数身份认领宿主，未命中原语宿主时回退到 Agent facade，不再按工具名查找方法。`Tool` 注册表迁到 `foundation/agent/chartToolRegistry`，使 engine 原语与 agent facade 都能安全引用，避免 engine 反向依赖 features。

## Consequences

- 新增对比品种写能力只能经 `ComparisonCommands`，不得再在 `Chart` 或 `ChartDataManager` 复制选择拼装。
- UI 不得在调用原语前后手工 `registerSymbols` 或写 `mainRightAxisTypeSetting`；品种登记与视图刻度副作用的唯一归属是原语。
- `ChartDataManager` 不再持有 add/remove 选择逻辑，仅保留对比数据注入与 runtime 投影（`ComparisonManager`）。
- UI 与 Agent 调用同一实例，行为一致；工具随原语模块加载注册。
- Agent 侧的对比新增失败必须抛出具名 `KLineChartError` 并带可操作 message，不得用布尔返回值表达失败原因；UI/程序化入口 `add` 保留 boolean 契约。
