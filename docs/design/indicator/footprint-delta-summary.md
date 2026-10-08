# Footprint Delta 汇总的展示

## 决策

每根 Footprint 柱下方展示该柱的成交额净差（Delta），规则如下：

1. **落点跟随柱脚**：以该柱最低可见价位行的底边下移固定间距作为文字基线，不吸附 pane 底部。
2. **越界即放弃**：文字若超出 pane 上下边界，本柱不画 Delta，而不是钉在 pane 底部。
3. **符号用正负号**：正值显式 `+`，负值沿用定点格式化自带的 `-`，零值不带符号；颜色仍按符号取卖方 / 买方 Token。
4. **字号与指标图例文本一致**（12px），复用共享 `FONT_FAMILY`。

## 原因

- 旧的 `Math.min(pane.height - 4, lowestVisibleY + 14)` 会在柱脚越过 pane 底边时把 Delta 吸附到 pane 底部。平移图表时该文字与它所属的柱分离，误导用户以为它属于视图底部而非某一根柱。
- `Δ` 是希腊字母，字形随字体栈回退而变，与后方数字拼在一起观感不一致；正负号与数字同源，语义更直接（正为主动买净流入，负为主动卖净流出）。

## 实现

- Delta 分支：`summaryY = lowestVisibleY + SUMMARY_OFFSET`，仅当 `summaryY - SUMMARY_FONT_SIZE >= 0` 且 `summaryY <= pane.height` 时绘制。
- 文本为 `${delta > 0 ? '+' : ''}${compactValue(bar.delta)}`，同一个 `delta` 用于选择 `footprintColors.ask / bid`。
- 字号常量 `SUMMARY_FONT_SIZE = 12`，与 `.klc-legend-row` 的图例文本保持一致。

## 取舍

- 柱脚贴近 pane 底边时 Delta 会整体消失，而不是被迫可见；这是「跟随柱体、保持位置真实」的必然结果。
- 零值不带符号但按买方色绘制，与既有颜色判定（`>= 0`）保持一致。
