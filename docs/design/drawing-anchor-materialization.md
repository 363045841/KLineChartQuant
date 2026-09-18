# 组合图元锚点物化、命中与交互视觉

## 决策

组合图元（`parallel-channel`、`flat-line`、`disjoint-channel`）在创建时把派生点一次性物化为持久化锚点，之后只持久化坐标；渲染、命中、拖拽一律只读 `anchors`。拖拽跟随规则由命中目标与拖拽策略声明，不进入持久化模型。

## 物化

- 锚点数量：`getDrawingInputAnchorCount(kind)` 是用户输入数（1 / 2 / 3），`getDrawingAnchorCount(kind)` 是补齐后的持久化数（组合图元为 4）。
- `materializeDrawingAnchors(kind, anchors, createAnchorId)` 把输入补齐。第三个输入锚点只提供价格，时间被忽略：派生点复制首两点的时间坐标，因此不依赖时间轴能力，也没有派生索引越界的失败路径。
  - `parallel-channel`：两条线跨越同样的首两点时间，斜率相同。第 3 点取次点时间 + 第三个输入价格（光标落在次点时间槽上跟手）；第 2 点取首点时间，价格 = `third.price − (second.price − first.price)`。
  - `disjoint-channel`：两条线跨越同样的首两点时间，斜率互为相反数。第 2 点取次点时间 + 第三个输入价格；第 3 点取首点时间，价格 = `third.price + (second.price − first.price)`。
  - `flat-line`：两个水平端点分别落在首两点的时间上，价格同取第三个输入价格。
- 同 X 配对：`parallel-channel` / `flat-line` 为 `0↔2`、`1↔3`；`disjoint-channel` 为 `0↔3`、`1↔2`——它的第 2 点是第二条线的右端、第 3 点是左端，由「第二条线端点 = 首两点时间 + 负斜率」唯一确定，不是 `flat-line` 的左右同价平移。
- 导入的旧 3 锚点快照在 `replaceDrawings` 时走同一函数补齐。

## 帧内消费

绘图定义直接读 4 个持久化锚点，线段按 `[0, 1]` 与 `[2, 3]` 成对构成，不再按 kind 推导。只有 `regression-channel` 保留 `computedAnchors`：端点是数据拟合结果，无固定坐标可持久化，命中时映射回两个范围锚点。

`parallel-channel` 额外在同 X 端点的中点连线上画一条虚线中线（`showEndpoints: false`），观感对齐 `regression-channel` 的中间回归线；中线纯装饰，不参与锚点、命中与拖拽。

## 命中

命中目标只有 `{ type: 'anchor', index }`（锚点）与 `{ type: 'all' }`（图元主体）两种。`HitTester` 的锚点命中天然覆盖全部持久化锚点，第 4 点因此可拖；线段与填充都属于「图元主体」，不存在「拖某条边只动这条线」的中间形态。

填充命中只覆盖三个组合图元：填充多边形顶点顺序由 `fillRegions.ts` 的唯一一张表声明，绘制（`createXxxDefinition` 的 `area`）与命中（点在多边形内判定）共用同一份顺序，不会各自漂移。不相交通道第二条线方向相反，环绕顺序与另两者不同，单独登记。命中优先级为锚点 > 中点手柄 > 线段 > 填充；矩形与回归通道的填充不由四个持久化锚点直接构成，仍按线段命中。

## 绘图落点钳制

- 进行中的多锚点图元会记住起始 Pane（`pendingPaneId`）。指针移出该 Pane 或绘图区（含底部时间轴、pane 间隙）时，`resolveDrawingPointer` 把落点贴到该 Pane 边界后照常解析，预览不再被抹掉，回到 Pane 内即恢复跟手；出界点击同样在边界处完成本次绘制。
- 钳制只发生在 `DrawingInteractionController` 的落点路径（`resolvePlacementOptions` 传 `clampPaneId`）；命中、框选、标签等只读路径仍严格要求指针在绘图区内，避免画布外假命中。
- 首个锚点不钳制：此时没有起始 Pane 可钳，指针必须落在有效 Pane 内才能开始绘制。
- 钳制范围：X 贴 `[0, plotWidth]`，Y 贴目标 Pane 的 `[top, top + height]`；贴边后再走磁吸与时间/价格反解析，因此边界点仍可参与磁吸。

## 拖拽策略

- `AnchorDragFollowers` / `resolveAnchorFollowers(kind, index)` 只回答「拖锚点 `index` 时哪些锚点一起动」。每项声明 `follow`：`time` / `price` 各取 `1` 同向、`-1` 反向、`0` 不跟随（缺省 1）；被拖锚点自身始终接受完整位移，未登记的图元只动被拖锚点。
- `DragHandler` 不认识 `kind`：锚点目标按 `resolveAnchorFollowers` 求移动组并按 `follow` 加权，整体目标对全部锚点施加同一屏幕位移；位移到时间 / 价格的换算仍由 `DragHandler` 统一完成。
- 已登记策略：
  - `parallel-channel`：端点按角色跨线成对（`0/2` 左端、`1/3` 右端）。拖任一端点时，另一条线上的同角色端点按同一位移跟随，剩下两点固定，两条线向量始终相同。
  - `flat-line`：`0/1` 斜线、`2/3` 水平线。同侧共享 X、水平线两端共享价格。拖斜线端点时水平线同侧端点只跟时间；拖水平线端点时斜线同侧端点只跟时间（`follow: { time: 1, price: 0 }`）、水平线另一端只跟价格（`follow: { time: 0, price: 1 }`）。
  - `disjoint-channel`：同 X 伙伴时间同向、价格反向（`follow: { time: 1, price: -1 }`），剩下两点固定；创建期不变量（`x(0) = x(3)`、`x(1) = x(2)`、`p(2) − p(3) = −(p(1) − p(0))`）在点拖与整体拖拽后都成立。
  - `regression-channel`：不做拖拽策略，命中映射回范围锚点后走缺省行为。

## 线段中点垂直手柄

- 声明：`lines.ts` 的线表逐条声明 `verticalHandle`，登记即开启。当前三个组合图元的两条线都开启；未声明的线不绘制、不命中。
- 可见与命中：手柄只在图元被选中时绘制（`frameProjection` 统一压在所有图元之后），也只在该图元被选中时参与命中；未选中时中点按线身命中 → 整体拖拽。宿主查询 `hitTestAt` 一律不返回手柄。
- 外观：中点为心的圆角矩形，与圆形锚点在视觉上区分；填充同锚点色、描边取图元颜色且始终实线。
- 移动：拖拽只改价格、不改时间。`DragHandler` 把指针 Y 相对快照中点的偏移换算成价格增量，对该线两个锚点同增同减；用价格增量而非屏幕位移，log 轴下这条线的价格差（以及 `disjoint-channel` 的镜像不变量）不被破坏。另一条线不受影响，`parallel-channel` 因此可能不再平行。
- 不持久化：中点是两端锚点的派生量，锚点数量、拖拽提交校验、序列化与 Agent 契约均不变。

## 悬停光标

- 推导：指针事件只记录位置（`InteractionController.lastClientPos`），不写悬停目标。目标在 `flushPendingHover()` 里用缓存的指针位置 + 本帧几何推导，与 crosshair / hover / tooltip 在同一个 `batch` 内写入。触发 flush 有三类：idle 指针移动、帧 K 线几何变化（`setKLinePositions` 比出引用/区间变化）、容器尺寸变化（`Chart.resize` → `invalidateHover`）；因此缩放、改尺寸后光标立即按新几何重算，写入点唯一。
- 契约：`DrawingInteractionController.getHoveredTarget` 返回 `DrawingHoverTarget`（`none` / `anchor` / `vertical-handle` / `all`，未命中为 `none`），kernel 以 `interactionSnapshot.drawingHoverTarget` 暴露，宿主按类型决定光标——中点手柄 `ns-resize`、线身 `move`、圆形锚点 `default`。
- 置 `none` 的时机：指针离开画布（`Chart.handlePointerEvent` 的 `pointerleave`）、悬停被清空（`InteractionController.clearHover`：滚轮、平移、拖拽、指针移出绘图区）、切换绘图工具（`ChartDrawingFacade.setTool`，悬停目标只对 `cursor` / `box-select` 有效）。

## 选中态锚点

- 锚点只在选中态可见：未选中图元的线段端点不绘制（`showEndpoints: false`）、锚点点图元不投影，未选中态只剩线与填充。唯一例外是创建中的预览（`PREVIEW_ID`），正在放置的点需要即时反馈。
- 外观：线段端点与点图元都由 `frameProjection.applySelectedStyle` 写入 `anchorFill`，渲染器（`createDefaultPrimitiveRendererSet` 的 `point` / `line`）据此填 `anchorFill` 并用圆形描边（`drawAnchor` 用 `arc`）。填充色是 `foundation/tokens/drawingColors.ts` 的 `DRAWING_ANCHOR_FILL`，业务代码不硬编码颜色。
- 选中态只加强锚点，线身不加粗：`applySelectedStyle` 不覆写 `strokeWidth`，线图元沿用图元自身线宽。
- 描边环是交互提示，始终实线：`drawAnchor` 描环前 `setLineDash([])`，`strokeStyle: 'dashed'` 只作用于线身（如 `regression-channel` 的中间回归线）。
- 锚点归属：线图元的端点即锚点；水平射线与十字线的锚点由显式 `role: 'anchor'` 的点图元提供（`flat-line` 的两个水平端点已由第二条线的端点覆盖，不重复投影）。
- 描边宽度：锚点与中点手柄共用 `ANCHOR_STROKE_WIDTH`，不受图元 `strokeWidth` 影响，选中态加粗只作用于线身。
