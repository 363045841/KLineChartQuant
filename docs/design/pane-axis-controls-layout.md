# Pane 轴控件与公共右轴宽度

右轴总宿主承载 Core 画布与 Vue 控件。Pane 快捷入口由 `PaneAxisControls` 根节点直接消费
Core 已提交的 top、height、axisWidth 定位，不再包裹独立宿主，也不复用高度为零的底部菜单。
`PriceAxisSettingsMenu` 只负责价格轴与时间轴交叉区域的菜单入口。

所有 Pane 共用右侧栏宽度。逐轴标签宽度决定每条轴的最低需求，剩余宽度由该 Pane
第一条轴吸收，保证单轴 Pane 的文字和快捷按钮都居中于完整右栏。多轴 Pane 继续按列布局。
原先只为最宽 Pane 补齐宽度，会使其它 Pane 的画布、文字中心和公共右栏不一致。

Core 在布局和轴列提交后都发布 paneGeometry，控件使用与画布相同的已提交宽度；
Vue 不读取 DOM 反推尺寸，不添加另一份宽度计算。
