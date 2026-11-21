# 绘图写入边界

## 背景

已确认图元的变更此前有两条路径：Controller 方法在写入 `DrawingDocument` 后请求重绘，而 Agent 工具直接写 `DrawingDocument`，后者改了状态却没有使 renderer 失效。同时，CRUD 逻辑一度散落在 `DrawingInteractionController` 会话对象里。

## 决策：DrawingCommands 是唯一提交写原语

`DrawingCommands` 是已确认绘图的唯一写原语。它拥有有序操作 `DrawingDocument mutation -> requestDraw`，覆盖 create、update、remove、clear、replace。

创建绘图时，新 `DrawingObject` 与其选中状态在同一次原子快照提交：`drawingState.actions.addDrawingsAndSelect()` 在单个 `batch()` 内写入 `drawings` 与 `selectedDrawingIds`。因此选择由创建操作本身产生，而不是 UI 层副作用。UI 交互与 Agent 工具到达同一个 `DrawingCommands` 实例，任一方画出的线都以相同方式创建并选中，仅选中才显示的轴标签无需额外接线。

Controller 持有一个 `DrawingCommands` 实例；UI 交互经 Controller 的 drawing adapter 到达它，Agent 工具拿到同一实例。`DrawingDocument` 仍是校验与状态提交的领域服务，对 Agent 侧只读（列出图元）。

## DrawingDocument CRUD 边界

- `kernel.drawing.drawings` 是已确认图元的唯一 SSOT；Scene 渲染只读取它与会话 overlay 的投影。
- `DrawingDocument` 提供 `list / get / create / update / remove / clear / replace`。`replace` 只服务受控组件和导入导出，日常变更必须使用按 id 的命令。
- `drawingState.actions` 提供原子 `upsert / update / remove`，负责不可变快照及选中 id 一致性。
- `DrawingInteractionController` 只持有 preview、drag override、锚点采集和命中检测；确认创建、拖拽提交、样式更新及删除均委托 `DrawingChartAdapter` 的领域命令。
- 外部创建和更新锚点使用 `time + price`。`DrawingDocument` 根据当前数据解析 `index`，不向调用方暴露派生渲染坐标。
- `__preview__` 仅属于会话 overlay，不能通过声明式 CRUD 持久化或暴露给 Agent。
- `DrawingDocument` 不依赖 DOM，不承担 pointer 坐标换算和渲染职责。

```text
pointer 交互 / Controller API / Agent Tool
                 |
                 v
           DrawingDocument
                 |
                 v
     drawingState 原子领域 action
                 |
                 v
      kernel.drawing -> Scene 投影
```

## Agent Tool

`features/agent/tools` 以纯数据声明以下工具，并全部委托同一组图元命令：

- `drawings_list`：read，返回 `{ timezone, period, drawings }`。每个图元给出 `id`、`kind`、`row`、`anchors`、`style`、`labels`、`visible`、`locked`、`zIndex`、`timeframeVisibility` 与 `visibleInCurrentPeriod`；`row` 是窗格身份，`id` 由系统分配。
- `drawings_write`：write，按 `action` 分发：
  - `create`：`row`、`kind`、按种类声明的锚点与样式，返回完整快照。
  - `update`：按 `id` 修改属性（style / labels / visible / locked / zIndex / timeframeVisibility）。
  - `delete`：按 `id` 删除，返回被删快照。

锚点时间用图表时区的 RFC 3339，日线及以上允许日期简写；写入不做槽位吸附。行号由 Core 解析成 Pane，调用方不接触 `paneId`。浏览器 Agent 的工具表在会话内固定；plan 模式在执行期按 `effect` 拒绝写工具，页面执行器不会收到调用。

## 后果

- 每次成功的提交变更恰好调度一次重绘；未命中的 update/remove 目标不重绘。
- 新的写入集成只能依赖 `DrawingCommands`，不得直接调用 `DrawingDocument` 写方法。
- 创建绘图会替换当前选择。需要保留既有多选的调用方无法通过 create 做到；选择变更始终经 kernel 的 `setSelectedDrawingIds` action。
- 绘图创建后的工具复位必须在 create 调用之前完成：把工具切回 `cursor` 会清除会话选择（`DrawingInteractionController.applyToolSession`），因此 create 必须最后执行，以保持新绘图处于选中态。
