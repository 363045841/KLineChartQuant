# Comparison Command Boundary

## Context

对比品种此前没有统一写入口：symbols 选择拼装散落在 `ChartDataManager`，视图与刻度副作用散落在 `Chart`，Agent 侧没有任何工具，旧 `ai-runtime` 又另有一套 add/remove 语义。

## Decision

`ComparisonCommands` 是对比品种的唯一写原语，实现 `ComparisonCommandsApi`，依赖 `ComparisonCommandsDependencies`。它用 `create` / `remove` / `clear` / `list` 统一处理 symbols 选择、比较视图切换与重绘。

选择仍写入 `kernel.actions.setSymbols`，`comparisonState.specs` 继续由 symbols 尾部派生，不新增可写 specs action，也不产生第二份业务状态。原语移除选择后，`ChartDataManager` 对 `comparison.readonly.specs` 的既有订阅会自动重算对比 buffer。

`@Tool` 直接标注在原语方法上：`comparisons_list`、`comparison_create`、`comparison_remove`、`comparisons_clear`。`Chart.comparisonCommands` 是唯一实例，`ChartController` 与 Agent 共用。

Agent runtime 通过 `ChartAgentController.toolHosts` 找到原语实例作为工具执行目标；bridge 按工具名在宿主上查找方法，找不到时回退到 Agent facade。`Tool` 注册表迁到 `foundation/agent/chartToolRegistry`，使 engine 原语与 agent facade 都能安全引用，避免 engine 反向依赖 features。

## Consequences

- 新增对比品种写能力只能经 `ComparisonCommands`，不得再在 `Chart` 或 `ChartDataManager` 复制选择拼装。
- `ChartDataManager` 不再持有 add/remove 选择逻辑，仅保留对比数据注入与 runtime 投影（`ComparisonManager`）。
- UI 与 Agent 调用同一实例，行为一致；工具随原语模块加载注册。
