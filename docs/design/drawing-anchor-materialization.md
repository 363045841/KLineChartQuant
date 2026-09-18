# 组合图元锚点物化与拖拽策略

## 决策

组合图元（`parallel-channel`、`flat-line`、`disjoint-channel`）在**创建时**把派生点一次性物化为持久化锚点，之后只持久化坐标。渲染、命中、拖拽一律只读 `anchors`，不再在帧内推导端点。拖拽时的跟随规则由命中目标与拖拽策略声明，不进入持久化模型。

## 问题

此前这三个图元只持久化 3 个锚点，第 4 个端点（`p4` / `h1` / `h2`）在 `compute()` 里由屏幕坐标推导并放进 `DrawingGeometry.computedAnchors`。命中检测只遍历 `drawing.anchors`，派生端点不在其中，因此该点无法被拖动；拖拽逻辑也只能按 `kind` 写特例。

## 创建期物化

- `getDrawingInputAnchorCount(kind)`：创建时用户输入的锚点数（1 / 2 / 3）。
- `getDrawingAnchorCount(kind)`：持久化后的完整锚点数（组合图元为 4）。
- `materializeDrawingAnchors(kind, anchors, createAnchorId)` 把输入锚点补齐为完整锚点。三个组合图元的第三个输入锚点一律只提供**价格**，其时间被忽略：派生点复制首两点的时间坐标（含未来槽位），因此不需要时间轴能力，也不存在派生索引越界的失败路径。
  - `parallel-channel`：第二条线与第一条线跨越同样的首两点时间、斜率相同。第 2 点取首点时间、价格取第三个输入点；第 3 点取次点时间，价格 = 第三个输入点价格 + (次点价格 − 首点价格)。
  - `disjoint-channel`：第二条线与第一条线跨越同样的首两点时间、斜率互为相反数。第 2 点取次点时间、价格取第三个输入点；第 3 点取首点时间，价格 = 第三个输入点价格 + (次点价格 − 首点价格)。
  - `flat-line`：两个水平端点分别落在首两点的时间上、价格取第三个输入点，替代输入的第三个锚点。
- `disjoint-channel` 的第 2 点为第二条线的右端、第 3 点为左端（与 `flat-line` / `parallel-channel` 的左右顺序相反），因此它的同 X 配对是 `0↔3`、`1↔2`，而不是 `0↔2`、`1↔3`。这是刻意的：第二条线由「第二条线端点 = 首两点时间 + 负斜率」唯一确定，不是 `flat-line` 的左右同价平移。
- `parallel-channel` 的两条线因此左右端各自同 X（`x(2) = x(0)`、`x(3) = x(1)`），与它的拖拽策略（`0/2` 左端、`1/3` 右端成对）互为前提。
- 旧的 3 锚点快照在 `replaceDrawings` 导入时按同一函数补齐。

## 帧内消费

绘图定义直接读 4 个持久化锚点。只有 `regression-channel` 保留 `computedAnchors`：它的端点是数据拟合结果，没有可持久化的固定坐标，命中时映射回两个范围锚点。

`HitTester` 的锚点命中天然覆盖全部持久化锚点，第 4 个点因此可拖。通道类图元的线段由持久化锚点按 `[0, 1]` 与 `[2, 3]` 成对构成，不再按 kind 推导。

## 拖拽策略

- 命中目标只有两种：`{ type: 'anchor', index }`（命中锚点）与 `{ type: 'all' }`（命中图元主体）。命中线段、填充等都属于「图元主体」，直接整体拖拽，不存在「拖某条边只动这条线」的中间形态；线条级的拖拽点（端点手柄）属于后续交互，届时再引入新的目标类型。
- `AnchorDragFollowers` 与 `resolveAnchorFollowers(kind, index)`：只回答「拖动锚点 `index` 时哪些锚点一起动」。每项可声明 `follow`（`time` / `price` 各取 `1` 同向、`-1` 反向、`0` 不跟随，缺省为 1）；被拖锚点自身始终接受完整位移。未登记的图元只动被拖锚点。
- `DragHandler` 不认识 `kind`：锚点目标按 `resolveAnchorFollowers` 求移动组并按 `follow` 加权，整体目标对全部锚点施加同一屏幕位移；屏幕位移与时间 / 价格的换算仍由 `DragHandler` 统一完成。

## 已登记策略

`parallel-channel`：端点按角色跨线成对（`0/2` 左端、`1/3` 右端）。拖动任一端点时，另一条线上的同角色端点按同一位移跟随，剩下两点固定，因此两条线向量始终相同、始终平行，创建期保证的同端同 X 也一直成立。

`flat-line`（平滑顶底）：`0/1` 为斜线端点，`2/3` 为水平线端点。同侧端点共享 X（`0↔2`、`1↔3`），水平线两端共享价格。拖斜线端点时，水平线同侧端点只跟时间；拖水平线端点时，斜线同侧端点只跟时间（`follow: { time: 1, price: 0 }`）、水平线另一端只跟价格（`follow: { time: 0, price: 1 }`），因此水平线始终水平、同侧 X 始终对齐。

`disjoint-channel`（不相交通道）：`0/1` 为第一条线，`2/3` 为第二条线；由创建期几何可知同 X 配对是 `0↔3`、`1↔2`。拖动任一端点时，同 X 的伙伴时间同向跟随、价格反向（`follow: { time: 1, price: -1 }`），剩下两点固定。

`disjoint-channel` 是刚性形状：创建期不变量（`x(0) = x(3)`、`x(1) = x(2)`、`p(2) − p(3) = −(p(1) − p(0))`）在点拖（同 X 配对同步 X、价格反向）与整体拖拽后都成立。

`regression-channel` 不做拖拽策略：其端点由数据拟合产生，命中时映射回两个范围锚点，走缺省行为。

## 线段中点垂直手柄

- 声明：`lines.ts` 的线表逐条声明 `verticalHandle`，登记即开启。当前 `parallel-channel`、`flat-line`、`disjoint-channel` 的两条线都开启；未声明的线不绘制手柄、不命中、拖拽策略返回 null。
- 可见与命中：手柄只在图元被选中时绘制（`frameProjection` 统一压在所有图元之后），也只在该图元被选中时参与命中；未选中时中点按线身命中 → 整体拖拽。宿主查询 `hitTestAt` 一律不返回手柄。
- 外观：中点为心的圆角矩形（与锚点同半径），形状由 `createDefaultPrimitiveRendererSet` 的 `point` 渲染器按 `role: 'translate-handle'` 决定：填充同锚点色、描边取图元颜色。
- 悬停光标：`DrawingInteractionController.getHoveredTarget` 返回命中目标类型（`none` / `anchor` / `vertical-handle` / `all`，未命中为 `none`，接口不带 null），kernel 以 `interactionSnapshot.drawingHoverTarget` 暴露；宿主按类型决定光标——中点手柄 `ns-resize`、线身 `move`、圆形锚点不改变光标。
- 推导时机：指针事件只记录指针位置（`InteractionController.lastClientPos`），不写悬停目标。目标在 `flushPendingHover()` 里用缓存的指针位置 + 本帧几何推导，与 crosshair / hover / tooltip 在同一个 `batch` 内写入。触发 flush 的时机有三类：idle 指针移动、帧 K 线几何变化（`setKLinePositions` 比出引用/区间变化）、容器尺寸变化（`Chart.resize` → `invalidateHover`）。因此缩放、改尺寸后光标按新几何立即重算，不会陈旧到下一次指针移动；写入点唯一，不存在"事件路径 + 帧路径"两个写入者。
- 置 `none` 的时机：指针离开画布（`Chart.handlePointerEvent` 的 `pointerleave` 分支）、悬停被清空（`InteractionController.clearHover`：滚轮、平移、拖拽、指针移出绘图区）、切换绘图工具（`ChartDrawingFacade.setTool`，悬停目标只对 `cursor` / `box-select` 有效）。
- 移动：拖拽只改价格、不改时间。`DragHandler` 把指针 Y 相对快照中点的偏移换算成**价格增量**，对该线的两个锚点同增同减；用价格增量而非屏幕位移，log 轴下这条线的价格差（以及 `disjoint-channel` 的镜像不变量）都不被破坏。另一条线不受影响：通道宽度会改变，`parallel-channel` 的两条线因此不再平行。
- 不持久化：中点是两端锚点的派生量，锚点数量、拖拽提交校验、序列化与 Agent 契约均不变。

## 选中态锚点

- 锚点只在选中态可见：未选中图元的线段端点不绘制（`showEndpoints: false`）、锚点点图元不投影，未选中态只剩线与填充。唯一的例外是创建中的预览（`PREVIEW_ID`）：正在放置的点需要即时反馈，保持原样。
- 选中图元的锚点统一画成「内部填充 + 图元颜色描边环」：线段端点与点图元都由 `frameProjection.applySelectedStyle` 写入 `anchorFill`，渲染器（`createDefaultPrimitiveRendererSet` 的 `point` / `line`）据此填充该色并描一圈 `style.stroke`。
- 锚点归属：线图元的端点即锚点；水平射线与十字线的锚点由显式 `role: 'anchor'` 的点图元提供（`flat-line` 的两个水平端点已由第二条线的端点覆盖，不再重复投影）。
- 填充色是 `foundation/tokens/drawingColors.ts` 的 `DRAWING_ANCHOR_FILL`（白），业务代码不硬编码颜色。
- 中点手柄与锚点同款：`frameProjection.projectVerticalHandles` 也写入 `anchorFill`，渲染器按 `role: 'translate-handle'` 填充该色并描边。
