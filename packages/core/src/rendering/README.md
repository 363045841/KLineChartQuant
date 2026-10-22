# Rendering 模块

本模块组织 Scene/Layer、执行统一原语并管理后端生命周期。完整说明见 [渲染架构](../../../../docs/rendering/rendering-pipeline.md)。

## 目录职责

- `scene/`：Layer 集合、pane/role/visible 过滤、目标选择、稳定排序与异常隔离。
- `primitives/`：公共 fill/stroke/circle/rect/text 契约、Canvas 解释器、GPU 合批、缓存和原子合成。
- `render/`：Renderer 身份、原语执行器与 RendererHost 创建、切换、降级、释放。

## 合成契约

Pane 持有原生 Canvas 目标。Scene 将 background/primary/indicator/component 分配到 main，drawing 分配到正式图元目标，overlay 分配到动态目标。三个目标按 `SCENE_TARGET_Z` 堆叠，同一目标内按 z 稳定排序。DOM 布局消费相同常量。main 目标内部再分两段：GPU 直出画布在下，2D 主画布在上。

`Layer.paint(context)` 的目标由 Scene 选择：`kind: 'draw-list'` 的图层拿不到 `context.ctx`，只能提交原语；`kind: 'context'`（缺省）的图层拿到完整 ctx，Scene 在其前后立即合成。Layer 不自行选择其他绘图区画布。坐标轴保持自己的原生表面和轴标签契约。

Scene 为每个绘制目标建立一个合成器：连续图层累积成一批，帧末一次落盘。成本随目标数增长，与图层数量无关。

`Renderer` 只提供 `caps.name`、必需的 `primitives` 和 `dispose()`，没有第二套 buffer/pipeline 或帧绘制 API。后端实现 `createSurface` 时为主图带提供可见 GPU 直出表面，画布由 Pane 拥有；否则 GPU Canvas 与深度/模板纹理仅为后端私有离屏资源，按有序批次合成到指定目标。目标级 MSAA 关闭，描边与形状的 AA 由解析覆盖率承担。Canvas 文字保持原始绘制顺序，失败由公共提交入口完整回退到同一目标。

## 后端与像素

RendererHost 只拥有执行器及后端选择，不拥有可见 Canvas 的尺寸或清屏。WebGPU 请求失败按 WebGL、Canvas 降级；同步构造尝试 WebGL、Canvas。切换后申请 All 帧，原有可见像素保留到下一帧重画。WebGPU device 与原语资源由同一后端释放。

几何使用目标局部逻辑像素，DPR 只读取 viewport 状态。Pane 在绘制帧内提交原生 Canvas 的物理尺寸和 DPR 变换；GPU 私有目标随当前目标定尺寸。非默认仿射变换使用 Canvas 解释器，避免错误的提前剔除。

截图同步复制已经完成 Scene 合成的原生 Canvas，不进行 GPU 纹理读回或替换源画布。

## 验证

core 单测覆盖帧调度、Scene 目标与顺序、几何、缓存、合批、失败回退和生命周期。`bench/primitives.html` 使用真实三后端检查像素、上传计数、完整 Chart 的遮挡和截图，并在同一图表中热切换后端。局部重绘不在当前实现范围内。
