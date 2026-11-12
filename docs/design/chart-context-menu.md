# 图表右键菜单

## 决策

绘图区右键弹出统一菜单（重置图表 / 复制价格 / 锁定垂直光标 / 移除所有指标 / 设置），复用既有能力而不是新增第二套菜单实现：

- **菜单外观与交互只有一份**：右键菜单直接使用 `DropMenu` 的 `context` 模式。该模式不渲染
  `ControlTrigger`，由宿主调用 `openAt(x, y)` 提供坐标锚点；分组、选中态、roving focus、
  Escape/外部点击关闭与普通下拉完全一致。普通下拉不传 `context`，行为不变。
- **分组由 `group` 键驱动**：菜单项声明只写平铺列表，`group` 相同的连续项合成一段，组间由
  面板绘制内缩分隔线；新增项不需要手写 `groups` 数组。命令项右侧显示注册表提供的当前平台
  快捷键文本。
- **定位复用 anchored popover**：`useAnchoredPopover` 新增可选的 `origin`，把指针坐标包装成
  零尺寸虚拟参考元素交给 Floating UI。原生 Popover 仍负责顶层与 light dismiss；CSS anchor
  positioning 需要真实锚点元素，因此坐标模式固定走 Floating UI。首次测量前面板先落在指针
  位置，避免顶层 popover 在默认位置闪一帧。
- **动作复用命令层**：「重置图表」直接执行 `view.reset`，与 Navigator 浮层按钮
  （`ChartNavigation`）完全相同地调用 `controller.resetChart()`；「设置」执行 `settings.open`。
  命令入口保证工具栏、快捷键、命令面板与右键菜单行为一致。
- **复制价格取十字线快照**：打开瞬间读取 `controller.interactionState.crosshairPrice` 并保存，
  不再实时读取。指针移入菜单会触发 `pointerleave` 清空 crosshair，实时读取会让标签闪烁。
  复制内容与价格轴价签一致使用两位小数；分时/比较等百分比轴仍复制原始价格（菜单语义是
  「价格」，不是轴展示文本）。无 crosshair 时该项禁用。
- **移除所有指标走 Core 聚合命令**：`Chart.panes.clearAllIndicators()` 在一次 `batch` 内删除
  当前工作区的主图与副图实例，并回收空副图；工具栏「清除指标」与右键菜单都调用
  `controller.clearAllIndicators()`，不各自维护删除循环。没有指标实例时菜单项禁用。
  实例删除与轴偏好清理的统一入口见 `docs/design/indicator-instance-removal.md`。
- **锁定垂直光标走 Core 时间投影**：菜单只把打开瞬间快照的 `crosshairIndex` 交给
  `controller.lockCrosshairAt()`，Core 保存 K 线时间与周期槽距，跨周期按时间重新投影。
  锁定时菜单项显示对勾，未锁定不显示图标；图标槽固定占位，文案不会左右位移。
  没有十字线且未锁定时禁用。设计见 `docs/design/crosshair-lock.md`。
- **右键不启动图表会话**：`Chart.handlePointerEvent` 在 `pointerdown` 时忽略鼠标非主键，
  否则右键会进入平移或绘图锚点会话。该判断放在框架共用的输入入口，Vue/React/Angular
  适配器一致生效。

## 边界

- 右键菜单只覆盖绘图区 `.chart-container`；价格轴有自己的设置入口，不弹出该菜单。
- 行内编辑控件（绘图文本输入等）内的右键不拦截，保留浏览器原生文本菜单。

## 回归

- `DropMenu` 现有键盘、焦点与选中用例保持通过。
- `useChartContextMenu` 覆盖价格快照、无 crosshair 禁用、无指标时移除项禁用、`group` 分组、
  快捷键文本、重置/设置走命令、清空指标走 controller、复制写剪贴板。
- `chart.lifecycle` 覆盖鼠标右键按下不进入拖拽，以及 `clearAllIndicators` 同时删除主图与副图
  实例并回收副图 Pane。
