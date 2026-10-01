# 价格轴滚轮缩放

价格轴与绘图区是兄弟 DOM 节点，Vue 在共同父节点接收滚轮事件。Core 的 `handleWheelEvent` 按事件目标分流：右侧价格轴交给 InteractionController，绘图区沿用时间轴缩放。

InteractionController 根据轴内 Y 坐标定位 pane，将像素、行、页滚轮增量统一到像素，限制单次增量后调用 `scalePrice`。滚轮向上放大，向下缩小；拖拽或捏合会话中忽略价格轴滚轮。

PriceScale 的缩放支持可选的 pane 内 Y 锚点。在原生刻度空间中，根据缩放前后的范围差补偿中心位移，使鼠标下的价格保持原坐标，并计入上下 padding。未传入锚点的拖拽继续按中心缩放，缩放与平移沿用现有限制。

主图沿用 HAND 范围及首屏初始化资格检查，通过 mainPriceAxis action 提交范围；自动范围模式不接受手动缩放。子图按 pane 能力进行缩放。
