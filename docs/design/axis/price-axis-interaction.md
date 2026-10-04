# 价格轴菜单与滚轮交互

## 菜单与重置

价格轴与时间轴交叉区域的入口复用 Vue 的 DropMenu，分为轴类型、纵轴模式、重置和位置四组。设置通过已有 `handleSettingsChange` 写入 controller，不增加独立状态。

价格轴仅保留一个 DOM 主机及一套刻度、装饰标签、十字线和交互实现。`priceAxisPosition` 设置决定该主机位于绘图区左侧或右侧，菜单位置组选项仅改变 flex 顺序，移动时不重新创建 Canvas、不改变价格范围。原来的独立左轴 renderer 与 layer 已移除。

ChartController 的 `resetMainPriceAxis` 转发主图 `resetPriceTransform`。手动缩放已提交到 kernel 的 `handRange`，仅清除 PriceScale 的临时变换不能恢复初始范围，因此重置同时清空 `handRange`；下一帧按可见行情重新初始化。重置保留轴类型和 AUTO/HAND 偏好。

重置使用点击时当前可见 range 的 Max/Min，滚动后的视图按新的可见行情适配，不恢复首次加载的价格范围。

`resetHandRange` 同时用于品种切换与用户重置，使手动范围的清除保持单一入口。

## 滚轮缩放

价格轴与绘图区是兄弟 DOM 节点，Vue 在共同父节点接收滚轮事件。Core 的 `handleWheelEvent` 按事件目标分流：右侧价格轴交给 `InteractionController`，绘图区沿用时间轴缩放。

`InteractionController` 根据轴内 Y 坐标定位 pane，将像素、行、页滚轮增量统一到像素，限制单次增量后调用 `scalePrice`。滚轮向上放大，向下缩小；拖拽或捏合会话中忽略价格轴滚轮。

`PriceScale` 的缩放支持可选的 pane 内 Y 锚点。在原生刻度空间中，根据缩放前后的范围差补偿中心位移，使鼠标下的价格保持原坐标，并计入上下 padding。未传入锚点的拖拽继续按中心缩放，缩放与平移沿用现有限制。

主图沿用 HAND 范围及首屏初始化资格检查，通过 `mainPriceAxis` action 提交范围；自动范围模式不接受手动缩放。子图按 pane 能力进行缩放。

逐 Pane 范围与手动状态见 [价格轴范围与逐 Pane 状态](price-axis-range-and-panes.md)。
