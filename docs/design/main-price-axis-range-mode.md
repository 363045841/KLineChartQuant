# 主图价格轴范围模式

主图价格轴使用 `auto | hand` 两种范围来源。

- `auto`：每帧依据当前可见数据计算并投影范围。
- `hand`（锁定价格对 K 线比例）：切换时将当前显示范围快照为 `handRange`；横向平移仍计算自动范围，但不改变显示范围。

`mainPriceAxisState` 是手动范围的唯一业务状态源；`PriceScale` 只投影该帧最终范围。绘图、K 线、Y 轴刻度和命中测试统一通过 `PriceScale` 的 `priceToY` 与 `yToPrice` 投影，避免为水平线引入屏幕坐标锚点或渲染层特例。

切换到 `hand` 后，主图允许纵向平移和右轴缩放；切回 `auto` 后清除手动变换并立即使用最新的 `autoRange`。
