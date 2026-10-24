# Core 渲染架构

本文对应当前源码，是单帧几何、Scene 调度、合成目标和三后端输出的事实来源。

## 所有权

| 模块 | 职责 |
| --- | --- |
| StateKernel | viewport、zoom、data、pane、drawing、主题与设置的唯一业务状态 |
| ChartViewportManager | ResizeObserver、原生 scroll 与 DOM 适配 |
| ChartPaneLayout / PaneRenderer | 可见 Canvas 的 DOM、尺寸、显示状态与释放；主图带 GPU 直出画布 |
| ChartRenderer | 帧事务、几何封存、目标清屏、Pane 上下文、轴标签与图例 |
| Scene | 图层过滤、合成目标、目标内排序、后端注入、帧内合成器与绘制异常隔离 |
| RendererHost | 后端创建、切换、降级、设备丢失与释放 |
| Renderer / primitives | 同一套有序原语的实际执行、GPU 私有资源、可选可见直出表面与失败回退 |

可见画布全部有明确所有者：Pane（主图带 2D 主画布、主图带 GPU 直出画布、drawing、overlay）、坐标轴、时间轴、十字线。后端不自行参与 DOM 堆叠；它只在 Pane 提供的画布上建立直出表面，画布的挂载、定位与尺寸都由 Pane 决定。

## 初始化与生命周期

Chart 使用注入的 RendererHost；直接同步构造时尝试 WebGL 后使用 Canvas。Controller 通过异步工厂按设置选择 WebGPU、WebGL 或 Canvas。

Host runtime 变化只写回 renderer 状态并请求 All 帧，不挂载、移除或调整可见画布。ChartRenderer 每次读取 Host 当前执行器，不缓存旧 Renderer。Pane 尺寸只在绘制帧内提交，随后同帧重画；后端离屏目标在 paint 时跟随可见目标的尺寸。

主图带直出画布由 Pane 创建、定位与定尺寸：后端切换时旧画布必须丢弃重建，一个 canvas 只能有一种上下文类型，WebGL → WebGPU 不能复用同一张画布。

销毁先停止调度、等待插件卸载和释放业务订阅，再销毁 Scene、Pane 和后端。WebGPU device 与原语设备由同一个 Renderer 释放。可见 GPU 画布是 Pane 的资源，随 Pane 一起释放；截图读的是合成后的原生像素，没有 GPU 纹理读回分支。

## 单帧链路

```text
Chart.scheduleDraw
  → ChartRenderer + FrameTransaction
  → capture → derive → seal → render → publish
  → prepareFrameData
  → sealFrameGeometry
  → 构造所有 Pane 上下文与 main/drawing/overlay 目标
  → 清理本帧需要更新的原生 Canvas
  → Scene.paint
      → pane / role / visible 过滤
      → 合成层带排序，再按目标内 z 稳定排序
      → draw-list 图层只提交原语（绘制上下文里没有 ctx）
      → context 图层注入 ctx，逐 Layer save / paint / restore
      → 每目标一个合成器：连续图层累积成一批，帧末一次落盘
          → 有可见 GPU 表面时几何直写该表面，否则离屏渲染后合成到 ctx
  → 统一绘制坐标轴标签、图例、时间轴与十字线
  → 完成同帧截图请求
```

FrameTransaction 在非 idle 阶段遇到重入输入只调度下一帧，不嵌套 flush。高频输入经 rAF 合并，绘制、交互与指标使用封存后的同一代几何。

## Viewport 与几何

`engine/state/viewportState.ts` 是 viewport 的唯一状态来源。它派生有效 DPR、plotWidth/plotHeight、内容宽度、导航、可见范围及几何快照。对象型 computed 在字段不变时保留引用。

ResizeObserver 优先使用 device-pixel-content-box；DPR 经过有效性处理和像素总量钳制。绘制模块不自行读取 window.devicePixelRatio。DOM effect 同步 Canvas 宿主尺寸并请求绘制帧 resize，不直接清空 GPU 或可见 Canvas 后备存储。

普通 K 线与分时由对应视图策略生成可见范围、kLineCenters、kBarRects 和槽位网格。世界坐标保留双精度；矩形投影先得到对齐的整数物理像素，再回算逻辑像素提交公共原语。分时横轴按交易时段槽位建立，不按已到达数据铺满窗口。

`prepareFrameData` 收集数据、指标状态、主题、价格范围、比较投影和当前帧唯一时间。`sealFrameGeometry` 将同一份几何发布给交互。Overlay 帧复用静态几何，但倒计时等动态字段仍从本帧唯一时间快照派生。paint 不读取时钟或安排 timer。

## 合成目标与层序

`scene/types.ts` 定义目标、角色映射与 `SCENE_TARGET_Z`，DOM 布局消费相同常量：

| 目标 | 角色 | DOM 层级 |
| --- | --- | --- |
| main | background / primary / indicator / component | 0 |
| drawing | drawing | 1 |
| overlay | overlay | 2 |

z 只在同一目标内决定叠放，相同 z 保留注册顺序。不能通过把 main 图层的 z 改大来跨越 drawing 或 overlay 层带。这个规则与浏览器 DOM 层序一致。

main 目标内部还有两段叠放：GPU 直出画布与 2D 主画布同为 z = 0，DOM 顺序上 GPU 画布在前，因此几何在下、文字与 `ctx` 图层在上。

每个 `FramePaint` 提供 `targets` 和当前 `renderer`。Scene 先选择目标，未分配的 drawing 目标跳过绘制。`kind: 'draw-list'` 的图层绘制上下文里没有 `ctx`，只能提交原语；`kind: 'context'`（缺省）的图层拿到 `context.ctx`，Scene 在它前后立即合成，保证自带裁剪与坐标系语义。业务 Layer 不绕开 Scene 选择其他绘图区画布。Scene 在 finally 中恢复 Canvas 状态，单个图层异常不会中断同 Pane 的其他图层。

坐标轴和时间轴有独立表面与轴标签接口；十字线使用图表级独立表面。它们不通过额外 GPU DOM 层来改变行情或 drawing 的遮挡。

## 更新级别

- Main 更新主图及静态轴内容。
- Overlay 更新动态内容；正式 drawing 仅在文档、选中、覆盖成员或几何变化时更新。
- All 同步更新需要变化的全部目标。

正式 drawing 与 session 仍持有独立投影和像素。拖拽连续移动复用正式层，提交或取消后重建正式层。空数据时清理所有原生可见目标，不存在额外 GPU 透明清屏。当前不实现对象级局部重绘或脏矩形。

## Renderer 与公共原语

Renderer 只提供：

- `caps.name`：canvas2d、webgl2 或 webgpu。
- 必需的 `primitives`：公共原语后端。
- `dispose()`：释放同一执行器拥有的资源。

公共命令是 fill、stroke、circle、rect、text，以及同色矩形的 `rects` 批次。蜡烛与 Plot 的矩形共用 `barGeometry/impl/paintBars.ts`；drawing 只把投影映射成这些命令。业务层不创建 shader、buffer 或 pipeline。

`PrimitiveBackend.paint(target, primitives, dpr, transform)` 返回 true 表示该批完成；false 保证可见目标未被半批结果污染。统一提交器失败后把整批 Canvas 命令写入同一 target，业务层没有各自的 GPU/Canvas 双路径。

Scene 为每个绘制目标建立一个合成器：连续输出原语的图层累积成一批，帧末统一落盘，每个目标每帧只做一次离屏渲染与合成；目标级状态（仿射变换、透明度、合成模式、阴影、滤镜）变化时才切段，并按提交时记录的状态重放。成本因此随目标数增长，与图层数量无关。

Canvas 直接解释命令。GPU 在私有离屏目标执行有序几何，完成后合成到 target；后端实现了 `createSurface` 时，主图带的几何直接写入 Pane 的可见画布，省掉离屏目标与 Canvas 侧的整张拷贝。文字直接用 Canvas：含文字的批次整批交给 Canvas 单次重放，既保留图文交错顺序，也不会为每段文字各做一次整画布离屏合成。

目标默认具有 DPR 缩放。额外仿射变换、非默认混合、阴影或滤镜使用 Canvas 解释器，不能先按错误坐标剔除再套变换。

## GPU 合批与缓存

圆、矩形、圆角矩形及带边框锚点使用解析形状实例管线，位置、颜色和描边为实例属性。相邻实例保持原始透明混合顺序。

简单直线、胶囊和小型凸形使用连续顶点直绘。复杂路径以有向三角扇累计 stencil winding，再 cover；支持凹形、自交、多轮廓与 evenodd。复杂描边展开为同向轮廓，避免交点重复混合。只有相邻、填充规则一致且包围盒不相交的复杂对象才合并 mask/cover。

完全在屏幕外的对象在 tessellation 前剔除。几何缓存归一化平移，按样式、DPR 和精确坐标快照判断失效，同时限制条目和字节数（1024 条 / 64 MiB）；淘汰按批进行，同一批用到的条目不参与淘汰，避免同帧自挤导致下帧全量重建。颜色独立缓存，常见 hex 直接解码，其他 CSS 颜色由浏览器解析一次后复用。

不透明描边直接以三角形绘制，不走 stencil：stencil 需要为每条折线按包围盒铺一次 cover，全宽指标线等于每帧多出若干次全幅填充。半透明描边保留 stencil，避免接缝重复混合。

不透明、实线、开放折线使用解析式描边（`segments`）：每段 14 个 float（四个点、半宽、颜色、标志位），6 个顶点在 vertex shader 里扩成包围盒，覆盖率在片元着色器按距离计算。圆角连接与圆端帽走胶囊区域，相邻两段共用端点角平分面切分像素归属；尖角连接与平头/方头端帽走凸四边形区域，相邻段共享同一条切边、互不重叠。两条区域都按距离场产生抗锯齿，拐角不会出现重复混合的硬边小结。闭合路径、bevel、半透明描边与虚线圆角折线仍走三角化。

纯折线指标在数据空间缓存：几何保留世界 x 与价格 y，滚动与轴缩放只改 `DataTransform` uniform，不重新三角化也不重写顶点缓冲。缓存按半屏分桶，纯滚动时桶不变即命中；世界坐标与滚动量分别对齐到物理像素，否则逐点舍入方向随滚动变化会让缓存每帧失效。

CPU 缓冲按容量增长，GPU buffer 复用连续布局；未变化时跳过上传，变化时每类数据每段最多上传一个连续区间。此优化不改变整层绘制范围。

## 后端选择与故障

| 设置 | 尝试顺序 |
| --- | --- |
| webgpu | WebGPU → WebGL → Canvas |
| webgl | WebGL → Canvas |
| canvas | Canvas |

初始化验证实际 GPU 原语设备。Host 只在新执行器准备完成后替换旧执行器，并请求 All 帧。异步创建使用 generation 丢弃过时结果；过时执行器必须释放。WebGPU device lost 进入同一 Host 降级流程。

同步构造因 WebGPU 初始化异步而尝试 WebGL、Canvas；Controller 的异步工厂支持完整设置。后端设置与实际 effective/status/error 分开记录。

## 截图

Chart.captureFrame 请求完整帧，并在帧完成位置调用捕获函数。`ChartFrameCaptureContext` 只提供该帧 DPR。

宿主在首次 await 前同步复制所有原生 Canvas 的原始物理像素，记录位置、祖先裁剪和 DOM 层序，再合成 DOM 浮层。屏幕与截图使用同一份已完成合成的像素，不读回 GPU 纹理、不替换源画布，也不额外缩放图表像素。

## 扩展与验证

第三方通过 `useRenderer(layer)` 注册 Layer，通过完整 id 查询或移除。Scene 拥有已接纳 Layer 的释放责任；外部数据变化后调用 requestRender。插件仍由 PluginHost 管理安装与卸载。

新增图形先投影为现有命令；只有公共契约无法表达且多个图形受益时才增加原语。新增后端实现同一 PrimitiveBackend，接入 Host 工厂并验证原子失败、DPR、透明顺序和资源释放，不增加业务专用绘制分支；需要直出能力时只实现 `createSurface`，画布的挂载、定位与尺寸仍由 Pane 负责。

core 单测覆盖事务、目标选择与排序、几何、缓存、失败回退、后端生命周期、DPR 和拖拽。jsdom 只提供 Canvas，不伪造始终成功的 GPU。`bench/primitives.html` 在真实三后端检查四种 DPR 像素、合批计数、完整 Chart 遮挡、热切换和截图一致性。

`getMetrics()` 提供 draw、上传次数与字节、submit、合成次数、缓存命中、剔除数和 CPU 准备/提交耗时。waitForIdle 只供基准使用，完成等待时间不能冒充 GPU timestamp。`bench/index.html` 的基准同样消费统一原语链路。

设计决策见 [Scene 单一合成链路](../design/scene-owned-composition.md)、[原语合批与资源复用](../design/primitive-batching-and-reuse.md)。
