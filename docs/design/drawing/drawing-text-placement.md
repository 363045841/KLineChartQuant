# 绘图文字统一摆放与标签垂直偏移

## 问题

绘图文字的落点原先分散在五处：线/箭头标签沿上侧法线偏移、区域标签按包围盒内缩、矩形/Box 文字在定义内联计算、斐波那契层级图文字内联加固定间距、独立 Label 直接落在锚点并垂直居中。

结果同类语义表现不一致：手动绘制的线段标签浮在线外侧，脚本 `label.new` 的文字压在价格和虚线上；同时 Label API 没有任何偏移能力，脚本只能自己改价格（价格单位，缩放时漂移）。

## 决策

1. `labelLayout.ts` 是唯一的文字摆放模块，按“谁拥有文字”提供四个落点函数：
   - `resolveLineLabelLayout`：线段/箭头标签，语义位置 + 上侧法线偏移，绘制与命中共用；
   - `resolveAreaLabelLayout`：填充区域标签，包围盒水平内缩；
   - `resolvePointLabelLayout`：独立标签，锚点 + 垂直偏移；
   - `resolveRectLabelLayout`：Box 文字，按四角对齐后叠加同一偏移；
   - `resolveFibLabelLayout`：斐波那契层级文字，右端外侧固定间距。
2. `DrawingText` 增加 `offsetY?: number`：逻辑像素，正数向上，默认 0。它只移动绘制位置，不改变锚点、命中与裁剪。
3. Label API 开放偏移能力：`label.new(..., offsetY)`、`set_yoffset`、`get_yoffset`。

## 边界

- 偏移是屏幕逻辑像素，不是价格，缩放时不会随价格轴漂移。
- 裁剪仍按锚点索引判断：标签整体上移不会改变它是否在可见区间内。
- 线/区域标签保留各自布局，不消费 `offsetY`。
- Pine 的偏移来自 `style_label_up/down` 等气泡样式；当前不渲染气泡，先提供显式偏移。将来补样式时，样式只提供偏移策略，落点仍由本模块统一计算。

## 验证

- `labelLayout.test.ts` 覆盖点标签正/负/零偏移、框内对齐与偏移、斐波那契间距。
- `drawingDefinitions.test.ts` 覆盖偏移后 text primitive 的实际坐标。
- `drawingObjects.test.ts` 覆盖两个后端下的 `label.new` 偏移参数、`set_yoffset` / `get_yoffset` 与默认值。
