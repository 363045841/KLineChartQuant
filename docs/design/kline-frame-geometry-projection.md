# K 线帧几何与屏幕投影

## 背景

K 线实体在世界坐标中按物理像素网格生成，但滚动偏移可能使其在屏幕坐标中再次落到半像素。此前 WebGL 和 WebGPU 会在提交阶段处理该偏移，Canvas2D 则仅通过 `translate(-scrollLeft, 0)` 绘制，三条后端路径的边界对齐语义不一致。

同时，帧准备阶段已经产出 K 线物理宽度，Candle renderer 仍会根据 `kWidth`、`kGap` 和 DPR 重建该规则。

## 决策

- `projectWorldRectToScreen` 是世界矩形 X 边界进入屏幕前的唯一 CPU 投影规则：左右边界分别吸附，再保证至少一个物理像素宽度。
- Canvas2D 与 WebGL 共用该函数。WebGPU 在 shader 内执行等价的顶点投影，因为该阶段必须在 GPU 执行。
- `kWidthPx` 作为帧级几何的一部分进入 `RenderGeometryContext`。Candle renderer 只消费该结果，不重新计算 K 线物理宽度。

## 边界

本变更只统一 Candle 矩形的 X 投影和物理宽度来源；折线、绘图及标记沿用其已有的几何契约。测试范围按本次需求不调整。
