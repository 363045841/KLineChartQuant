# 图表右键菜单

## 触发源

绘图区只有一个 `contextmenu` 入口，先用容器局部坐标查询命中，再按来源打开对应菜单：

- `DrawingInteractionController.hitTestAt(x, y)` 命中可见图元 → `ContextMenuSource` 为
  `{ kind: 'drawing', drawingId }`；
- 未命中 → `{ kind: 'chart' }`。

来源只保留图元 id，不携带完整图元快照。菜单外观仍复用 `DropMenu` 的 `context` 模式，只保留一个面板
实例，由 `source.kind` 切换分组、图标与动作分发，因此不会出现图表菜单和图元菜单同时打开。
命中检测使用公开的 `hitTestAt`，双击图元打开设置也走同一入口，没有第二套命中实现。

右键不会改变选中集合：`Chart.handlePointerEvent` 在 `pointerdown` 时忽略鼠标非主键，右键不会进入
平移、绘图锚点或图元拖拽会话。图元菜单因此必须在打开瞬间自行快照操作范围，不能依赖右键后的选中状态。

## 图表菜单

空白处右键弹出：重置图表 / 复制价格 / 在当前价格绘制水平线 / 锁定垂直光标 / 移除所有指标 / 设置。

- **外观与交互只有一份**：`DropMenu` 的 `context` 模式不渲染 `ControlTrigger`，由宿主调用
  `openAt(x, y)` 提供坐标锚点；分组、选中态、roving focus、Escape/外部点击关闭与普通下拉一致。
- **分组由 `group` 键驱动**：菜单项声明只写平铺列表，`group` 相同的连续项合成一段，组间由面板
  绘制内缩分隔线；命令项右侧显示注册表提供的当前平台快捷键文本。
- **动作复用命令层**：「重置图表」执行 `view.reset`，「设置」执行 `settings.open`，与工具栏、
  快捷键和命令面板走同一入口。
- **复制价格取十字线快照**：打开瞬间读取 `crosshairPrice`，指针移入菜单触发的 `pointerleave`
  不会让标签闪烁；复制内容使用两位小数，无 crosshair 时禁用。
- **绘制水平线复用公开的 `createDrawing`**：把打开瞬间快照的 `crosshairPrice` 与十字线所在
  `activePaneId` 交给 `controller.createDrawing()`，`kind`、锚点与默认样式与手绘工具一致。
- **移除所有指标走 Core 聚合命令**：调用 `controller.clearAllIndicators()`，一次 `batch` 删除
  当前工作区主图与副图实例并回收空副图，没有指标时禁用。
- **锁定垂直光标走 Core 时间投影**：菜单只把快照的 `crosshairIndex` 交给
  `controller.lockCrosshairAt()`，Core 保存槽位时间与周期槽距；锁定时显示对勾，设计见
  `docs/design/crosshair-lock.md`。

## 图元菜单

命中图元时弹出：复制 / 克隆 / 锁定 / 隐藏 / 移除。五个动作全部走现有 `ChartController` API，
不新增 Core 入口，也不在 Vue 侧维护第二份图元状态。

- **操作范围在打开瞬间快照**：命中的图元已在选中集合内时，`targetIds` 取整个选中集合，保留
  多选语义；否则只取该图元，并调用 `setSelectedDrawingIds()` 让画面选择与操作范围一致。
  之后菜单动作只读 `targetIds`，不重新读取实时选中集合。
- **锁定状态同样快照**：从 `controller.drawings.peek()` 按 `targetIds` 计算 `allLocked`，
  决定「锁定/解锁」文案与「移除」的禁用态；菜单打开期间不随实时信号变化。
- **复制与克隆语义不同**：复制调用 `copyDrawingsToClipboard(ids)`，只写内部剪贴板，不修改文档、
  不产生撤回历史；克隆调用 `copyDrawings(ids)`，按当前视口计算偏移并生成副本，整组副本是一次
  撤回步骤，副本成为新的选中集合。
- **锁定与隐藏走批量补丁**：锁定调用 `updateBatch(ids, { locked })`，隐藏调用
  `updateBatch(ids, { visible: false })`；锁定图元仍接受这两个字段的 patch，Core 会在隐藏后
  把图元从选中集合中剪掉。
- **移除走批量删除**：`removeBatch(ids)` 原子删除一次历史；Core 会过滤仍锁定的图元，全部锁定
  时返回 `false`。菜单在全部锁定时禁用「移除」；混合选中时只删除未锁定项，与浮动工具栏一致。
- **命令只提供快捷键文案**：`drawing.copy` / `drawing.clone` 命令内部读取实时选中的图元集合，
  菜单若执行命令会偏离打开瞬间的快照，因此只读取其快捷键文本，执行仍直接用快照 ids 调用 API。
- **分组**：复制/克隆一组，锁定/隐藏一组，移除单独一组；移除与其它动作之间保留视觉分隔。

## 边界

- 右键菜单只覆盖绘图区 `.chart-container`；价格轴有自己的设置入口，不弹出该菜单。
- 行内编辑控件（绘图文本输入等）内的右键不拦截，保留浏览器原生文本菜单。
- `hitTestAt` 只命中当前 Pane、当前工作区和可见图元；锁定图元仍可命中，因此可以右键解锁。
- 绘图工具激活时右键同样按命中打开图元菜单；克隆会取消当前绘制会话，其余动作不改变会话。
- 图元菜单不提供「粘贴」和「显示全部」；粘贴走命令层，恢复显示走工具栏的全局可见性入口。

## 回归

- `DropMenu` 现有键盘、焦点与选中用例保持通过。
- `useChartContextMenu` 覆盖价格快照、无 crosshair 禁用、无指标时移除项禁用、`group` 分组、
  快捷键文本、重置/设置走命令、清空指标走 controller、复制写剪贴板、按当前价格与 pane 创建水平线。
- `useDrawingContextMenu` 覆盖来源判定、打开瞬间的操作范围快照、多选保留、未选中时同步选中、
  锁定/解锁文案、全部锁定禁用移除、复制/克隆/锁定/隐藏/移除的 API 参数，以及动作不随选中变化。
- `chart.lifecycle` 覆盖鼠标右键按下不进入拖拽，以及 `clearAllIndicators` 同时删除主图与副图
  实例并回收副图 Pane。
