<!-- 绘图多选状态与 Agent 上下文设计。 -->

# 绘图多选状态与 Agent 上下文

## 决策

绘图选择态使用 `selectedDrawingIds: readonly string[]`，由 `kernel.drawing` 单独持有；不将选中标记写入 `DrawingObject`，也不保留单选 id 或主选中 id。

选中数组始终是去重、冻结且仅包含现存图元 id 的快照。图元替换、删除和清空时，图元列表与选中数组在同一次 `batch()` 内同步更新。

绘图渲染统一通过 `projectDrawingsForFrame(store, definitions, context)` 生成每 Pane 的 `DrawingFrameProjection`。投影包含 primitives、X/Y 轴标签和范围带；它在 `ChartRenderer` 调用 `scene.paintPane` 前完成。所有 renderer 只读该结果，禁止在 `draw()` 中修改 `RenderContext` 传递轴装饰数据。

## 渲染与交互边界

`DrawingStore` 读取选中 id 集合，绘制层对集合内的全部图元应用选中样式。选中图元的坐标轴标签和范围带也逐个投影。

普通点击命中图元会将选择收敛为该图元并开始拖拽；Ctrl 点击只将命中图元加入或移出选择集合，不开始拖拽。Ctrl 点击空白处保留当前选择，普通点击空白处清空选择。

## 批量属性

`DrawingDocument.updateBatch()` 与 `removeBatch()` 是批量写入的唯一入口。批量目标必须全部存在，否则整次操作不写入。

`getBatchStyleKeys()` 返回所有目标图元样式字段的交集。`updateBatch()` 只接受该交集内的样式字段；任何非交集字段都会使整次操作无效，避免部分图元被修改。`visible`、`locked` 与 `zIndex` 是所有图元共有的字段，可直接批量更新。

交互拖拽传递的是已解析 `DrawingAnchor`，通过 `commitDrawingDrag()` 直接提交；外部 API 的 `DrawingAnchorInput` 只用于创建和声明式更新，二者禁止相互伪装转换。

## Agent 上下文

Core 的 `ChartAgentContextSnapshot` 使用 `drawingSelection` 表示当前选择：无选择为 `null`，有选择时包含 `selectedIds` 和按该顺序投影的图元快照。

Vue Browser Bridge 将其转换为 `drawing-selection` ContextItem。该项只暴露图元 id、类型、pane、可见性、锁定、zIndex、锚点和已定义样式值；不暴露渲染坐标、预览图元或内部索引。
