# 价格轴展示与生效刻度

## 偏好与生效拆分

`settings` 只保存用户偏好，`kernel.pane.paneScaleTypes` 只保存当前生效刻度。

| 字段 | 含义 |
| --- | --- |
| `mainRightAxisTypeSetting` | 用户希望主图右轴是什么：`none / linear / log / percent`。`linear/log/percent` 同时决定坐标怎么算 |
| `mainLeftAxisDisplaySetting` | 用户希望左轴显示什么：`none / price / percent` |
| `paneScaleTypes` | 每个 pane 当前真正使用的坐标类型 |

分时/比较只覆盖 `paneScaleTypes` 和展示推算，不改 Setting。退出后恢复进入前的 `paneScaleTypes`。`none` 只隐藏右轴，不改当前刻度。

展示由 `resolveEffectiveAxisDisplay()` 推算：分时固定左百分比、右价格；比较视图右轴默认百分比。轴标签、渲染与刻度格式统一经该函数，不再各自判断视图。

旧键 `rightAxisType` / `leftAxisType`，以及短暂存在的 `mainPriceScaleTypeSetting` / `mainRightAxisDisplaySetting`，在 `migrateStoredSettings` 中迁到 `mainRightAxisTypeSetting`。

## 分时左右价格轴

单日和五日分时统一在右侧显示相对昨收的百分比，左侧显示实际价格。模式覆盖规则集中在 `resolveEffectiveAxisDisplay`，不修改用户的 K 线轴偏好。

左右刻度共用同一组 Y 坐标和原始价格，右侧换算为百分比，左侧直接格式化价格。价格 Pane 补齐左轴画布与上下文。Vue 提供独立的左轴 flex 容器并传给 Core，分时显示时为价格刻度预留宽度，容器宽度变化通过已有 ResizeObserver 更新行情视口。分时右轴固定在右侧，离开分时后恢复用户的轴位置偏好。副图保留自身指标数值刻度。

回归测试检查单日、五日的左右展示规则和实际刻度文本。

## 布局细节

Vue 默认 `rightAxisWidth` 为 0，实际轴宽还包含 `priceLabelWidth`。左轴容器及画布必须计入标签宽度，避免挂载后产生零宽画布。组件挂载测试检查左轴 DOM 传递、非零宽度及分时切换时两侧同时显示。

双轴模式的竖直分隔线仅由轴容器绘制，行情区两侧不添加边框和圆角，避免相邻边框叠加变粗。左轴画布按容器内部宽度缩放，避免盖住边框。

Pane 间的水平分隔线统一由宿主的 pane 分隔层绘制，横跨行情区与左右轴。Core 网格层不再额外绘制副图顶部线，贴在 Pane 上下边界的刻度网格也不绘制，避免 Canvas 线与 DOM 边框叠加。Pane 内部刻度网格保持不变。
