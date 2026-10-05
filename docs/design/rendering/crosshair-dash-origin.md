# 图表级十字线覆盖层

## 问题

Issue [#293](https://github.com/363045841/KLineChartQuant/issues/293)：水平、垂直虚线从 pane 边缘开始，交点相位各自独立，出现 L / T 形或错位。逐 pane 绘制纵线还会重启相位，并受各自的坐标舍入与裁剪影响。

## 决策

十字线不再注册为 `LAYER_PANE_GLOBAL`。`CrosshairOverlay` 拥有一张覆盖整个绘图区的透明 Canvas2D，挂载在 `ChartDom.canvasLayer` 中，由浏览器直接合成到 pane 表面之上，不做逐 pane 复制或拼接。它不覆盖左右价格轴和底部时间轴；轴标签继续使用原有轴表面。

`ChartRenderer` 在 pane 范围和 Scene 绘制完成后提交一次十字线。交点的全局 Y 为活跃 pane 的 `top + priceToY(price)`，无有效价格或活跃 pane 时使用鼠标全局 Y。全局交点只做一次物理像素中心对齐，四个方向使用独立路径、`[4, 4]`、零 dash offset、`butt` 端帽和 `1 / dpr` 线宽，虚线从中央空隙外开始。

纵线覆盖整个 `plotHeight`，包括 pane 分隔区。四条射线分别从交点向外偏移至少 2 个逻辑像素后开始描边，偏移量向上取整为整物理像素，中央留空且四向对称。水平线裁剪到活跃 pane，避免价格轴平移后水平线误入相邻副图。起点越过目标边界时不绘制该方向，避免反向路径穿过中央空隙；交点在画布外时仍保留其虚线相位。

## 生命周期与合成

- 表面由 ChartRenderer 创建和释放，pane 增删或重排不重建它。ChartPaneLayout 只回收自己拥有的 canvas，不再查询并批量删除其它模块的表面。
- 每个绘制帧使用引擎 viewport 的 `plotWidth / plotHeight / dpr` 更新缓冲尺寸和逻辑尺寸，不创建第二套 ResizeObserver 或 DPR 状态。Main、Overlay、All 帧均在最终合成前更新十字线。
- 鼠标离开时清空旧像素；无数据时接入 `clearAllCanvases`；销毁时移除 DOM 并释放像素缓冲。
- 截图已有的 canvas 遍历、层叠排序与同帧复制会自动收集该表面，Canvas2D / WebGL / WebGPU 都使用同一覆盖层。

矩形像素辅助函数仍被网格等绘制使用，保留工具。旧的 pane 十字线 Layer 与局部相位投影全部移除。

## 验证

回归测试覆盖全局价格交点、不同 DPR 和尺寸、跨 pane 的完整纵线、隐藏清屏与表面释放。Core 集成测试覆盖 pane 重建与 DPR 更新；浏览器人工验收检查鼠标移动、resize、多 pane 下的实际交角及截图合成效果。
