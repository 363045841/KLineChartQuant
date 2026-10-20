# Core 渲染架构

本文对应当前源码，是单帧几何、Scene 调度、合成目标和三后端输出的事实来源。

## 所有权

| 模块 | 职责 |
| --- | --- |
| StateKernel | viewport、zoom、data、pane、drawing、主题与设置的唯一业务状态 |
| ChartViewportManager | ResizeObserver、原生 scroll 与 DOM 适配 |
| ChartPaneLayout / PaneRenderer | 可见 Canvas 的 DOM、尺寸、显示状态与释放 |
| ChartRenderer | 帧事务、几何封存、目标清屏、Pane 上下文、轴标签与图例 |
| Scene | 图层过滤、合成目标、目标内排序、后端注入与绘制异常隔离 |
| RendererHost | 后端创建、切换、降级、设备丢失与释放 |
| Renderer / primitives | 同一套有序原语的实际执行、GPU 私有资源与失败回退 |

后端没有直接参与 DOM 堆叠的可见画布。可见像素全部位于 Pane、坐标轴、时间轴、十字线等明确所有者持有的原生 Canvas 中。

## 初始化与生命周期

Chart 使用注入的 RendererHost；直接同步构造时尝试 WebGL 后使用 Canvas。Controller 通过异步工厂按设置选择 WebGPU、WebGL 或 Canvas。

Host runtime 变化只写回 renderer 状态并请求 All 帧，不挂载、移除或调整可见画布。ChartRenderer 每次读取 Host 当前执行器，不缓存旧 Renderer。Pane 尺寸只在绘制帧内提交，随后同帧重画；后端离屏目标在 paint 时跟随可见目标的尺寸。

销毁先停止调度、等待插件卸载和释放业务订阅，再销毁 Scene、Pane 和后端。WebGPU device 与原语设备由同一个 Renderer 释放。不存在独立可见 GPU 画布的清理或截图分支。

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
      → 注入 ctx 与 sceneRenderer，逐 Layer save / paint / restore
          → 公共原语执行并合成到 ctx，或原生 Canvas 绘制
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

每个 `FramePaint` 提供 `targets` 和当前 `renderer`。Scene 先选择目标，未分配的 drawing 目标跳过绘制，再把目标写入 `Layer.paint` 的 `context.ctx`。业务 Layer 不绕开 Scene 选择其他绘图区画布。Scene 在 finally 中恢复 Canvas 状态，单个图层异常不会中断同 Pane 的其他图层。

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

公共命令是 fill、stroke、circle、rect、text。蜡烛与 Plot 的矩形共用 `barGeometry/impl/paintBars.ts`；drawing 只把投影映射成这些命令。业务层不创建 shader、buffer 或 pipeline。

`PrimitiveBackend.paint(target, commands, dpr)` 返回 true 表示该批完成；false 保证可见目标未被半批结果污染。统一提交器失败后把整批 Canvas 命令写入同一 target，业务层没有各自的 GPU/Canvas 双路径。

Canvas 直接解释命令。GPU 在私有离屏目标执行有序几何，完成后按图层顺序合成到 target。文字直接用 Canvas；图文交错是提交边界，混合批次使用私有 staging 保证原子回退，不能为了合批把所有文字挪到最后。

目标默认具有 DPR 缩放。额外仿射变换、非默认混合、阴影或滤镜使用 Canvas 解释器，不能先按错误坐标剔除再套变换。

## GPU 合批与缓存

圆、矩形、圆角矩形及带边框锚点使用解析形状实例管线，位置、颜色和描边为实例属性。相邻实例保持原始透明混合顺序。

简单直线、胶囊和小型凸形使用连续顶点直绘。复杂路径以有向三角扇累计 stencil winding，再 cover；支持凹形、自交、多轮廓与 evenodd。复杂描边展开为同向轮廓，避免交点重复混合。只有相邻、填充规则一致且包围盒不相交的复杂对象才合并 mask/cover。

完全在屏幕外的对象在 tessellation 前剔除。几何缓存归一化平移，按样式、DPR 和精确坐标快照判断失效，同时限制条目和字节数。颜色独立缓存，常见 hex 直接解码，其他 CSS 颜色由浏览器解析一次后复用。

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

新增图形先投影为现有命令；只有公共契约无法表达且多个图形受益时才增加原语。新增后端实现同一 PrimitiveBackend，接入 Host 工厂并验证原子失败、DPR、透明顺序和资源释放，不增加可见 DOM 表面或业务专用绘制分支。

core 单测覆盖事务、目标选择与排序、几何、缓存、失败回退、后端生命周期、DPR 和拖拽。jsdom 只提供 Canvas，不伪造始终成功的 GPU。`bench/primitives.html` 在真实三后端检查四种 DPR 像素、合批计数、完整 Chart 遮挡、热切换和截图一致性。

`getMetrics()` 提供 draw、上传次数与字节、submit、合成次数、缓存命中、剔除数和 CPU 准备/提交耗时。waitForIdle 只供基准使用，完成等待时间不能冒充 GPU timestamp。`bench/index.html` 的基准同样消费统一原语链路。

设计决策见 [Scene 单一合成链路](../design/scene-owned-composition.md)、[原语合批与资源复用](../design/primitive-batching-and-reuse.md)。
