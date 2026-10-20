# Scene 单一合成链路

原先蜡烛通过可见 GPU canvas 输出，新 Plot 原语却合成回主 Canvas。Scene 的 z 排序无法覆盖 DOM 的固定堆叠，导致指标即使后画仍可能被蜡烛盖住，后端回退还可能改变遮挡。

现在每个后端只提供 `Renderer.primitives` 与生命周期。蜡烛、Plot、drawing 使用同一公共原语执行器，所有结果都写入 Scene 选择的原生 Canvas 目标。不存在独立可见 GPU canvas，也不保留旧 buffer/pipeline、surface、region、beginFrame/endFrame 或 GPU 截图替换接口。

Scene 定义三个明确层带：main、drawing、overlay。前者容纳背景、主行情、指标与组件，drawing 保存正式图元，overlay 保存动态内容。同一层带内按 z 稳定排序；跨层带按固定目标顺序排列。DOM 布局使用同一份 `SCENE_TARGET_Z`，避免声称全局 z 排序却输出到不同 DOM 层。Scene 在调用前注入 `context.ctx`，并用 save/restore 隔离每个 Layer；业务 Layer 不再自行选择 drawing 或 overlay 输出目标。

GPU 的 Canvas 和 MSAA 纹理只作为后端私有离屏资源。后端执行成功后按当前 Layer 顺序合成到指定目标。文字直接由 Canvas 绘制，图文交错保留原始顺序；失败回退也写到同一目标。非默认仿射变换使用 Canvas 执行，避免后端提前按错误坐标剔除图形。

可见 Canvas 的尺寸与清屏属于 Pane 和帧调度。RendererHost 切换执行器不会挂载、清理或调整可见画布；GPU 私有目标在实际 paint 时跟随目标尺寸。WebGPU device 与原语设备由同一个后端释放。

截图在完整帧完成后同步复制原生 Canvas 像素，再按 DOM 层序与裁剪合成 DOM 浮层。没有 GPU 纹理读回、源画布替换或可见 GPU surface 的特殊分支，截图和屏幕消费的是同一份已完成合成的像素。

不实现局部重绘。现有 Main/Overlay 更新、正式图元像素保留和拖拽预览隔离继续有效。

真实浏览器回归入口为 `bench/primitives.html`：原语像素与性能计数之外，还挂载完整 Chart、真实 Pane DOM 和 Scene，在同一图表上切换 Canvas、WebGL、WebGPU，验证指标覆盖主图、drawing 覆盖主图、overlay 覆盖 drawing，以及截图像素与屏幕一致。jsdom 不再伪造始终成功的 GPU context；GPU 编译和绘制必须由浏览器验证。
