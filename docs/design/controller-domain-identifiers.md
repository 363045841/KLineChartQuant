# Controller 领域标识来源

ChartController 的销毁回退与初始化需要使用引擎已有的领域标识，避免与运行时默认值分叉：

- 绘图工作区引用 `ChartWorkspaceId.KLine`，与工作区快照、绘图投影使用相同的 ID。
- 默认绘图工具引用绘图交互契约中的 `CURSOR_DRAWING_TOOL_ID`；绘图状态初始化、重置及 ChartDrawingFacade 的空值处理共用该值。
- 主图 Pane 引用引擎 Pane 领域的 `MAIN_PANE_ID`；它与表示“所有 Pane”的 `GLOBAL_PANE_ID` 不同。
- 指标选择器引用公开契约中的 `INDICATOR_ROLE`，角色类型由同一组运行时取值推导。
- 挂载校验错误引用 `CONTROLLER_ERROR_CODES.CONFIG_INVALID`，其协议值保持不变。

这些改动仅统一标识来源，不更改既有的字符串协议值及控制器销毁后返回值。
