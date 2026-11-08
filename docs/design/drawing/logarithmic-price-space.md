<!-- 绘图几何的价格空间：对数轴下锚点、通道与回归线的计算口径。 -->

# 绘图几何的价格空间

绘图几何原本一律按「价格」做线性运算：锚点增量、通道平行复制、回归拟合、上下轨偏移都直接在价格上加减。线性价格轴上这与屏幕一致；对数价格轴上不一致——同样的价格差在低位是长线段、在高位是短线段。

## 表现

对数轴上通道两轨不再与屏幕等距，回归通道的上下轨宽度在视觉上随价格变化，拖拽通道时镜像锚点会明显偏离。

## 决策

### 1. 引入价格空间，不引入第二套几何

新增 `PriceSpace = 'price' | 'log'` 与四个纯函数（`toPriceSpace`、`fromPriceSpace`、`offsetPriceInSpace`、`priceSpaceOf`）。所有几何仍按原有公式写，只是先把价格映射进空间、算完再映回价格。

对数空间取价格的**自然对数**。坐标轴内部用的是 `log10(price) + c`，两者只差一个正的常数因子；等距、斜率反向、同比例缩放这些性质不受常数因子影响，因此不需要与轴实现绑定同一个底。

### 2. 非正价格显式失败，不做线性回退

对数轴无法表示零与负数。映射得到非有限值时，几何计算返回 `null`（「算不出来」），由调用方跳过绘制；锚点物化返回输入副本。不回退到线性公式——那会在同一条通道上混用两套口径，且错误只体现在形状上，很难被发现。

### 3. 空间跟着 Pane 的刻度类型走，不由调用方猜

`scaleType` 从 `PaneLayoutInfo` 暴露（`controllers/types.ts` 新增字段，`createDrawingMethods` 填充），绘图侧通过 `DrawingDocumentDependencies.getPriceSpace(paneId)` 获取。取不到 Pane 信息时抛 `DRAWING_ERROR_CODES.UNKNOWN_PANE`，而不是默认线性。

### 4. 三处落点

| 落点 | 处理 |
| --- | --- |
| 锚点物化（平行/不相交通道第 4 点） | 价格差改在空间里做：`offsetPriceInSpace(third.price, ∓delta, space)` |
| 回归通道（拟合 + 上下轨） | 先对 `toPriceSpace` 后的值做最小二乘；半宽 `deviation` 存为空间量，加减后再映回价格 |
| 拖拽镜像 | 无需改代码 |

拖拽镜像本来正确：`DragHandler.followAnchorGroup` 用屏幕位移移动跟随点，再用 `yToPrice` 反解价格，天然经过轴的刻度换算。为避免后人「顺手改成价格差」，补了对数轴用例锁定该性质（价格翻倍时镜像伙伴减半）。

## 契约变化

- `PaneLayoutInfo` 增加 `scaleType`（唯一扩契约点，实现 1 处，测试替身 8 处）。
- `DrawingDocumentDependencies` 增加 `getPriceSpace(paneId)`。
- `computeLinearRegression` / `computeRegressionChannel` 增加 `space` 入参；回归通道模型里 `offset` 更名 `deviation`，单位改为空间量。

## 验证

`pnpm type-check` 通过；`packages/core` 全量 247 文件 2831 用例通过，其中新增对数轴用例覆盖拖拽镜像与回归通道的两个端点取值。
