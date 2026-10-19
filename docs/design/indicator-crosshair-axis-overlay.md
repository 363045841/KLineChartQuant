# 副图十字线轴标签动态刷新

鼠标移动只触发 Overlay 帧，原先放在 indicator 静态刻度层的十字线标签不会更新。

通用指标轴工厂分别创建静态刻度层与 overlay 标签层。SubPaneManager 同时挂载这两个层，并在隐藏、参数重建和删除副图时一起卸载。动态层身份由静态轴身份统一派生。

动态标签使用 pane 内坐标与原有指标格式化选项，绘制到 yAxisOverlayCtx / yRightOverlay。ChartRenderer 每个 Overlay 帧清理此画布，保证鼠标离开或切换副图时旧标签消失。固定刻度只在 Main / All 帧重画。系统价格轴动态层只生成价格 pane 的十字线标签，避免副图重复显示通用价格格式的标签。
