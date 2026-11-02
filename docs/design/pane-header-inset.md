# Pane 顶部占位：图例让位与内容区

左上角图例必须占据真实布局空间，行情、指标和绘图都不能画进这块区域。实现遵循一条单向链：

```
图例行几何（legend 领域，唯一来源）
      ↓ legendHeaderInset(rows, paneTop)
PaneLayoutDependencies.getHeaderInset(paneId)
      ↓
Pane.setContentInsets(yPaddingPx + headerInset, yPaddingPx)
      ↓
PriceScale 私有 padding → priceToY / yToPrice
      ↓
蜡烛、指标、刻度、十字线、命中测试自动跟随
```

## 职责边界

- **只有主图占位**：左上角行情图例属于主图，副图标题行按设计叠加在指标上，不参与占位。
- **Pane 布局拥有内容区**：只有 `ChartPaneLayout.layoutPanes` 写内容区内缩，其他模块不写 padding。内容区上边界取 `max(yPaddingPx, 占位高度)`：占位高度已含底部间距，不再叠加视觉留白。
- **图例只发布高度**：`LegendManager.headerInsets` 按 pane 发布“顶部被图例占用多少像素”，布局只消费这个数字，不反读图例、图例也不读 padding。
- **`PriceScale` 内部持有 padding**：对外只暴露 `getContentTop()` / `getContentBottom()` / `getContentHeight()`，不再暴露 `getPaddingTop/getPaddingBottom`；消费方不再各自计算 `height - top - bottom`。
- **渲染器不需要知道 padding**：用 `priceToY` 画价格的渲染器无需改动；需要贴边的内容（Y 轴刻度、marker、十字线夹取）读内容区边界。网格与刻度都按内容区铺开，占位带保持纯背景，不再出现只有纵向网格穿过图例区的错位。

## 时序

图例在帧末才投影（`ChartRenderer.renderPanes` → `projectLegendFrame`），而 pane 布局发生在绘制帧开头：

1. 占位高度变化时，`LegendManager` 只在数值真正变化时重发快照。
2. `Chart` 订阅该快照，仅置位 `legendLayoutPending` 并请求下一帧。
3. 下一帧开头 `commitPendingLayout` 统一执行 `layoutPanes`，随后绘制，因此同帧内内容区与画布一致。
4. 内容区变化会改变 `y → 价格` 映射，提交布局后使悬停价格重算。

图例行数、紧凑断点、收起状态变化都会改变占位，走同一条链路。

## 图例几何 SSOT

`legend/impl/legendGeometry.ts` 定义行盒高度、行间距、底部间距、紧凑宽度与收起控件高度，并导出 `legendHeaderInset` 与 `legendRowTop`。主图行情行、主图指标行、副图标题行和自定义行共用这套几何；`LegendRow.y` 表示行盒顶部，DOM 直接使用该坐标。文本在行盒内垂直居中，行盒顶部按半行距上移，因此行情行的上、左内边距一致，不再需要 DOM 侧补偿。

## 收起

收起状态属于图例领域（`LegendManager.mainCollapsed`），DOM renderer 只提交切换意图。收起后所有主图行隐藏，占位只保留收起控件的高度；没有行时不占位；主图默认 DOM 被关闭（`legend.visible === false`）时也不占位。收起态下指标全部移除会由投影自动回到展开态，避免占位与显隐错位。
