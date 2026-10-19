# 时间轴尺寸与绘制同帧提交

纵轴自适应宽度改变容器宽度后，ResizeObserver 更新视口状态。原先 viewportState 的 DOM effect 立即修改时间轴 canvas 的 width / height，浏览器会同步清空后备存储，而重绘通过 requestAnimationFrame 延后执行，产生跨帧空白。

时间轴画布的后备存储尺寸与 CSS 尺寸改由 ChartRenderer.renderXAxis 在绘制帧中提交，随后立即绘制时间刻度、十字线时间签与装饰标签。视口状态仍是尺寸与 DPR 的唯一来源；DOM effect 继续同步绘图区宿主尺寸，不再提前清空时间轴。

等待绘制期间保留上一帧时间轴像素，尺寸未变时跳过 canvas 尺寸赋值。纵轴自动宽度策略保持原样。回归测试覆盖容器缩窄与 DPR 改变：绘制前保留原尺寸，绘制后新尺寸与文字一起就绪。
