# 绘图选择、框选与多选

## 选择态

绘图选择态使用 `selectedDrawingIds: readonly string[]`，由 `kernel.drawing` 单独持有；不将选中标记写入 `DrawingObject`，也不保留单选 id 或主选中 id。

选中数组始终是去重、冻结且仅包含现存图元 id 的快照。图元替换、删除和清空时，图元列表与选中数组在同一次 `batch()` 内同步更新。

## 状态机与交互规则

框选和拖拽通过 `DrawingInteractionController` 的 `idle | marquee | drag` 指针会话状态机互斥仲裁。框选工具处于 idle 时，优先命中已选图元：命中后进入 drag；未命中或命中未选图元才进入 marquee。pointermove 与 pointerup 仅按当前会话分发，避免工具 ID 与多个会话字段共同决定行为。

普通点击命中图元会将选择收敛为该图元并开始拖拽；Ctrl 点击只将命中图元加入或移出选择集合，不开始拖拽。Ctrl 点击空白处保留当前选择，普通点击空白处清空选择。Shift 与 Ctrl 同为多选修饰键。

## 框选

`box-select` 是独立的 `DrawingToolId`。交互控制器在按下、移动和抬起期间维护仅存在于会话内的 `DrawingSelectionMarquee`：它不写入 StateKernel、不进入绘图列表，也不参与历史快照。

框选仅作用于起始 Pane。松开时，控制器取得该 Pane 和当前工作区内的可见图元；任一可见线段与选区相交即命中。所有命中图元按 Ctrl 点击相同的 toggle 规则原子更新：已选图元移出选择，未选图元加入选择，其他图元维持不变。

选择规则定义在 `engine/drawing/session/impl/DrawingSelection.ts`，并从绘图模块入口导出：`clearDrawingSelection` 与 `toggleDrawingSelection`。交互控制器只调用这些纯函数并把结果写回 `selectedDrawingIds`。光标工具与框选工具的空白点击都会清空选择；框选不足最小面积时按空白点击处理。

多选后拖动已选图元的线段或主体时，`DragHandler` 会以所有选中图元创建同一组拖拽快照，并对所有锚点应用相同屏幕位移。拖动过程仅通过会话 overlay 渲染；松开时使用批量拖拽命令原子提交。命中锚点则只拖动该图元的锚点，保持既有精确编辑语义。

## 渲染

绘图渲染统一通过 `projectDrawingsForFrame(store, definitions, context)` 生成每 Pane 的 `DrawingFrameProjection`。投影包含 primitives、X/Y 轴标签和范围带；它在 `ChartRenderer` 调用 `scene.paintPane` 前完成。所有 renderer 只读该结果，禁止在 `draw()` 中修改 `RenderContext` 传递轴装饰数据。

`DrawingStore` 读取选中 id 集合，绘制层对集合内的全部图元应用选中样式。选中图元的坐标轴标签和范围带也逐个投影。

轴标签按图元语义投影，不按锚点坐标猜测：`point` 锚点（趋势线、矩形、通道等）同时投影价格与时间标签；`horizontal-line`、`horizontal-ray` 只有价格语义，只投影价格轴标签，且横贯视口、不要求锚点时间落在可视范围内；`vertical-line` 只有时间语义，只投影时间轴标签。

框选状态在 `projectDrawingsForFrame` 中追加为一个 `AreaPrimitive` 和四个 `LinePrimitive`。它复用绘图 primitive 管线与 `drawingRenderer`，而非创建 DOM 遮罩、额外 canvas 或伪造 `rectangle` 图元。颜色使用 `selectionFill` 与 `selectionStroke` Token，边框使用原生绘图 primitive 的虚线样式。

## 批量属性

`DrawingDocument.updateBatch()` 与 `removeBatch()` 是批量写入的唯一入口。批量目标必须全部存在，否则整次操作不写入。

`getBatchStyleKeys()` 返回所有目标图元样式字段的交集。`updateBatch()` 只接受该交集内的样式字段；任何非交集字段都会使整次操作无效，避免部分图元被修改。`visible`、`locked` 与 `zIndex` 是所有图元共有的字段，可直接批量更新，锁定图元同样接受——锁定只冻结几何拖动与删除，`removeBatch()` 对混合选择只移除未锁定项（详见 [全局绘图锁定](drawing-global-lock.md)）。

交互拖拽传递的是已解析 `DrawingAnchor`，通过 `commitDrawingDrag()` 直接提交；外部 API 的 `DrawingAnchorInput` 只用于创建和声明式更新，二者禁止相互伪装转换。

## Agent 上下文

Core 的 `ChartAgentContextSnapshot` 使用 `drawingSelection` 表示当前选择：无选择为 `null`，有选择时包含 `selectedIds` 和按该顺序投影的图元快照。

Vue Browser Bridge 将其转换为 `drawing-selection` ContextItem。该项只暴露图元 id、类型、pane、可见性、锁定、zIndex、锚点和已定义样式值；不暴露渲染坐标、预览图元或内部索引。

## 取舍

当前绘图 primitive 后端是 Canvas2D；框选不单独接入指标/K 线使用的 GPU 批绘制路径，避免为临时交互引入第二套绘图协议。未来绘图 primitive 的后端升级会自动覆盖框选，无需改变交互逻辑。
