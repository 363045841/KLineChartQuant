# scale 模块

图表坐标标度的唯一来源，按轴分为两个平级实现子目录：

- `impl/scale_Y/`：**纵向价格标度**。`priceScale.ts` 的 `PriceScale` 负责价格 ↔ pane 内 Y 像素映射，以及纵向平移、纵向缩放与线性/对数/百分比三种刻度；`logFormula.ts` 提供对数变换公式；`price.ts` 提供 `PriceRange` 与基础换算。
- `impl/scale_X/`：**横向槽位标度**。`types.ts` 定义 `ScaleXInput` / `ScaleXSnapshot` / `ScaleXStrategy`；`scaleXStrategies.ts` 的 `SCALE_X_STRATEGIES` 按当前数据视图把输入投影成横向几何快照（槽位中心、实体宽度、内容宽度、可滚动区间），并提供缩放与平移导航策略。

两个轴互不依赖，是坐标系统的两半：scale_Y 决定价格画在多高，scale_X 决定数据画在多宽。

- `index.ts`：模块唯一出口，转发两个轴的公开面。
