# Scene 单一合成链路

原先蜡烛通过可见 GPU canvas 输出，新 Plot 原语却合成回主 Canvas。Scene 的 z 排序无法覆盖 DOM 的固定堆叠，导致指标即使后画仍可能被蜡烛盖住，后端回退还可能改变遮挡。

现在每个后端只提供 `Renderer.primitives` 与生命周期。蜡烛、Plot、drawing 使用同一公共原语执行器，所有结果都写入 Scene 选择的原生 Canvas 目标。蜡烛专属的可见 GPU canvas 已删除，也不保留旧 buffer/pipeline、surface、region、beginFrame/endFrame 或 GPU 截图替换接口；主图带的可见直出表面改由 `PrimitiveBackend.createSurface` 提供。

Scene 定义三个明确层带：main、drawing、overlay。前者容纳背景、主行情、指标与组件，drawing 保存正式图元，overlay 保存动态内容。同一层带内按 z 稳定排序；跨层带按固定目标顺序排列。DOM 布局使用同一份 `SCENE_TARGET_Z`，避免声称全局 z 排序却输出到不同 DOM 层。Scene 在调用前为 `context` 图层注入 `context.ctx`（`draw-list` 图层没有 ctx），并用 save/restore 隔离每个 Layer；业务 Layer 不再自行选择 drawing 或 overlay 输出目标。

Scene 还为每个目标注入帧内合成器（`primitives`）：`kind: 'draw-list'` 的相邻图层合并成一批，每个目标每帧只合成一次；`kind: 'context'`（缺省）的图层前后立即合成，层级顺序不变。旧的逐层合成让每个 Layer 各付一次全目标离屏渲染与整张拷贝，成本随层数增长；现在成本随目标数增长，与图层数量无关。

`draw-list` 图层的绘制上下文不含 `ctx`，只能提交纯增量原语，所以"不改裁剪/坐标系"是编译期约束而不是约定。

## 主图带直出

GPU 后端的每个 pane 拥有一张可见的主图带画布（`mainGpuCanvas`），纯增量图层的几何直接写入它，**不再经过 Canvas 侧的整张 `drawImage`**；文本仍写到其上方的 2D 主画布，`ctx` 图层也留在那里。由此形成固定的三段叠放：

1. 可见 GPU 表面：背景（网格）、主行情、指标几何；
2. 2D 主画布：文字、比较线、区域、结构等 `ctx` 图层；
3. drawing / overlay 画布：正式图元与动态覆盖。

因此**背景带必须输出原语**：任何 `ctx` 绘制的背景都会落到第 2 段，盖住第 1 段的行情。直出失败时整批回落到 2D 合成，行为与 Canvas 后端一致。

可见画布由 Pane 创建、定位与定尺寸：后端切换时旧画布必须丢弃重建，一个 canvas 只能有一种上下文类型。两种 GPU 后端的直出细节不同：

- WebGL2 直出画布直接作为绘制目标（context 自带抗锯齿），并开启 `preserveDrawingBuffer` 以支持截图读像素；离屏目标不开启，合成后不保留上一帧。
- WebGPU 直出表面仍然渲染到 4x MSAA 颜色纹理再 resolve 到画布，与 WebGL 的抗锯齿对齐；省掉的是 Canvas 侧的整张拷贝，不是 MSAA 本身。离屏目标同样是 4x MSAA + resolve。

文字不进 GPU，直出表面只接受几何原语；含文字的批次不进入直出路径。

GPU 的 Canvas 与 MSAA 纹理都是后端私有资源：可见表面自持纹理，离屏目标只服务合成路径。后端执行成功后按当前 Layer 顺序合成到指定目标。文字直接由 Canvas 绘制，图文交错保留原始顺序；失败回退也写到同一目标。非默认仿射变换使用 Canvas 执行，避免后端提前按错误坐标剔除图形。

可见 Canvas 的尺寸与清屏属于 Pane 和帧调度。RendererHost 切换执行器不会挂载、清理或调整可见画布；GPU 私有目标在实际 paint 时跟随目标尺寸。WebGPU device 与原语设备由同一个后端释放。

截图在完整帧完成后同步复制原生 Canvas 像素，再按 DOM 层序与裁剪合成 DOM 浮层。没有 GPU 纹理读回、源画布替换或可见 GPU surface 的特殊分支，截图和屏幕消费的是同一份已完成合成的像素。

不实现局部重绘。现有 Main/Overlay 更新、正式图元像素保留和拖拽预览隔离继续有效。

真实浏览器回归入口为 `bench/primitives.html`：原语像素与性能计数之外，还挂载完整 Chart、真实 Pane DOM 和 Scene，在同一图表上切换 Canvas、WebGL、WebGPU，验证指标覆盖主图、drawing 覆盖主图、overlay 覆盖 drawing，以及截图像素与屏幕一致。jsdom 不再伪造始终成功的 GPU context；GPU 编译和绘制必须由浏览器验证。
