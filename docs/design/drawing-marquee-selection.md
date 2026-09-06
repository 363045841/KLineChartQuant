# 绘图框选

## 背景

绘图已支持 Ctrl 点击切换单个图元的选中状态。框选工具需要以相同规则批量切换图元，同时不能产生可持久化的矩形绘图。

## 决策

`box-select` 是独立的 `DrawingToolId`。交互控制器在按下、移动和抬起期间维护仅存在于会话内的 `DrawingSelectionMarquee`：它不写入 StateKernel、不进入绘图列表，也不参与历史快照。

框选仅作用于起始 Pane。松开时，控制器取得该 Pane 和当前工作区内的可见图元；任一可见线段与选区相交即命中。所有命中图元按 Ctrl 点击相同的 toggle 规则原子更新：已选图元移出选择，未选图元加入选择，其他图元维持不变。

选择规则定义在 `engine/drawing/DrawingSelection.ts`，并从绘图模块入口导出：`clearDrawingSelection` 与 `toggleDrawingSelection`。交互控制器只调用这些纯函数并把结果写回 `selectedDrawingIds`。光标工具与框选工具的空白点击都会清空选择；框选不足最小面积时按空白点击处理。

多选后拖动已选图元的线段或主体时，`DragHandler` 会以所有选中图元创建同一组拖拽快照，并对所有锚点应用相同屏幕位移。拖动过程仅通过会话 overlay 渲染；松开时使用批量拖拽命令原子提交。命中锚点则只拖动该图元的锚点，保持既有精确编辑语义。

框选和拖拽通过 `DrawingInteractionController` 的 `idle | marquee | drag` 指针会话状态机互斥仲裁。框选工具处于 idle 时，优先命中已选图元：命中后进入 drag；未命中或命中未选图元才进入 marquee。pointermove 与 pointerup 仅按当前会话分发，避免工具 ID 与多个会话字段共同决定行为。

## 渲染

框选状态在 `projectDrawingsForFrame` 中追加为一个 `AreaPrimitive` 和四个 `LinePrimitive`。它复用绘图 primitive 管线与 `drawingRenderer`，而非创建 DOM 遮罩、额外 canvas 或伪造 `rectangle` 图元。颜色使用 `selectionFill` 与 `selectionStroke` Token，边框使用原生绘图 primitive 的虚线样式。

## 取舍

当前绘图 primitive 后端是 Canvas2D；框选不单独接入指标/K 线使用的 GPU 批绘制路径，避免为临时交互引入第二套绘图协议。未来绘图 primitive 的后端升级会自动覆盖框选，无需改变交互逻辑。
