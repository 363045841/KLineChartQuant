# Rendering 模块

`rendering` 提供图表绘制的通用基础设施，位于业务绘制代码与具体图形 API 之间。它负责组织
Scene/Layer、统一 Renderer 契约，并管理 WebGPU/WebGL2/Canvas2D 后端。

完整的单帧时序、几何准备、Canvas 分层和 DPR 处理以
[`docs/rendering/rendering-pipeline.md`](../../../../docs/rendering/rendering-pipeline.md) 为准。本文只介绍本目录的
边界、组成和扩展方式。

## 模块边界

```text
Chart / ChartRenderer
  负责帧事务、几何快照、pane 遍历和 beginFrame/endFrame
                    |
                    v
scene/              Scene 按 pane、role、visible、z 组织 Layer
                    |
                    v
render/             Renderer 绘制原语与 Surface 生命周期
                    |
          +---------+---------+
          |         |         |
        WebGPU    WebGL2   Canvas2D
```

本目录不负责：

- K 线、指标、坐标轴等业务图形的具体绘制；这些代码位于 `engine/renderers`。
- viewport、缩放、滚动和 DPR 状态；它们由 StateKernel 和 `ChartViewportManager` 维护。
- 帧几何计算；`ChartRenderer.prepareFrameData` 负责生成同一帧共享的几何快照。
- Layer 的注册；实际 paint 调度由 Scene 负责。

## 目录结构

| 目录      | 职责                                                      | 主链路状态 |
| --------- | --------------------------------------------------------- | ---------- |
| `scene/`  | 定义 Scene/Layer，按 pane 和 role 过滤并按 z 顺序绘制     | 已接入     |
| `render/` | 定义 Renderer/SurfaceBackend，提供三个后端及 RendererHost | 已接入     |

## Scene 与 Layer

`scene/types.ts` 定义两个核心契约：

- `Layer` 是独立绘制单元，声明 `id`、`role`、`pane`、`z` 和 `visible`，并实现
  `paint`、`dispose`。
- `Scene` 持有 Layer 集合，通过 `paint(frame)` 一次完成所有 pane 的绘制。

`createScene()` 的绘制规则如下：

1. 只选择当前 `paneRole` 或 `global` 的 Layer。
2. 跳过 `visible === false` 的 Layer。
3. 可按 `LayerRole` 进一步过滤，例如 Overlay 帧只绘制 `overlay`。
4. 按 `z` 从低到高稳定排序，`z` 相同时保持注册顺序。
5. Scene dispose 后，所有公开操作都变为 no-op。

Layer role 包括 `background`、`primary`、`indicator`、`component`、`drawing` 和 `overlay`。
role 用于分组和增量绘制，最终叠放顺序仍以 `z` 为准。

旧式 `RendererPlugin` 已退役；渲染器工厂直接返回 `Layer`。`Layer.paint` 接收 Scene 注入的
帧上下文（业务 `RenderContext` + `sceneRenderer`），因此渲染器不需要感知具体 GPU 后端。

## Renderer 与 Surface

`render/Renderer.ts` 定义后端无关的绘制接口：

- 资源生命周期：`createBuffer`、`writeBuffer`、`createPipeline` 和对应 destroy 方法。
- 帧边界：`beginFrame(region)` 与 `endFrame()`。
- 绘制原语：`drawInstances()` 和 `drawLines()`。
- WebGPU compute：`createComputePipeline()` 和 `dispatchCompute()`；调用前必须检查
  `renderer.caps.compute`。

`drawInstances()` 和 `drawLines()` 返回 boolean。`true` 表示后端已经完成该批绘制；`false`
表示资源、pipeline 或 surface 不满足要求，业务层必须走 Canvas2D 兜底。禁止 GPU 和 2D
同时绘制同一批内容。

`render/SurfaceBackend.ts` 管理底层 canvas/context，包括 resize、region 绑定和清屏。
Renderer 管绘制原语，SurfaceBackend 管输出表面，两者不要互相承担职责。

## 线条解析抗锯齿

GPU 线宽不走原生线段：`render/analyticLineGeometry.ts` 的 `buildAnalyticLineGeometry(points, width, dpr)` 把折线展开为逐段四边形（butt 端，无 miter join），每顶点携带逻辑 `x,y` 与物理像素距离 `edgeDist,edgeHalf`；WebGL 与 WebGPU 共用该几何（WebGL 侧实现在 `engine/renderers/webgl/candleSurface.ts`）。填充带保持独立输入，不依赖该函数。

- 每有效段生成六个顶点；几何沿法线两侧各外扩一个物理像素；不延长 butt 端点。
- fragment 覆盖率：`aa = max(fwidth(edgeDist), 1e-4)`，`coverage = clamp((edgeHalf - abs(edgeDist)) / aa + 0.5, 0, 1)`。
- WebGL 使用直通 RGBA + SRC_ALPHA 混合，输出 `vec4(rgb, alpha * coverage)`；蜡烛可能关闭 BLEND，线条与填充带必须在每批 draw 时恢复混合。
- WebGPU 使用预乘 RGBA + one / one-minus-src-alpha 混合，输出 `color * coverage`；线条为 16-byte triangle-list pipeline，填充带保留独立实心 shader 与 8-byte 布局。
- 保留 MSAA，与解析 AA 和轴向像素吸附共存：解析 AA 负责侧边，MSAA 处理端点与其他图元。
- 缓存：WebGL 按点列引用与线宽缓存，用双精度点值快照检查原地修改，DPR 改变时清空；WebGPU 按原始点值、线宽、DPR 与轴向吸附需要的滚动位置判断是否重建。
- 逐段绘制在急转弯或半透明重叠处仍可能叠色，这是无 join 几何的既有局限。

## 后端与降级

`RendererHost` 持有当前 Renderer，并负责创建、切换、降级、resize 和销毁：

| preference | 尝试顺序                  |
| ---------- | ------------------------- |
| `webgpu`   | WebGPU -> WebGL -> Canvas |
| `webgl`    | WebGL -> Canvas           |
| `canvas`   | Canvas                    |

`runtime` 暴露当前 `effective` backend、`status` 和错误信息。请求后端不可用但成功降级时，
状态为 `degraded`。WebGPU device lost 后，Host 会尝试切换到 WebGL，再由既定降级链保证
Canvas 可用性。

Chart 默认使用 `createDefaultRendererHostSync()`，启动时尝试 WebGL，失败后使用 Canvas2D。
需要 WebGPU 或运行时热切换时，使用异步 `createDefaultRendererHost(preference)` 或
`RendererHost.switchTo()`。

三个实现的主要入口是：

- `createWebGPURenderer.ts` / `createWebGPUSurfaceBackend.ts`
- `createWebGLRenderer.ts` / `createWebGLSurfaceBackend.ts`
- `createCanvas2DRenderer.ts`

## 坐标与 DPR 契约

- `SurfaceRegion` 的 `x`、`y`、`width`、`height` 都是逻辑像素。
- Layer 和业务 Renderer 使用相对当前 pane region 的逻辑坐标。
- SurfaceBackend 负责把 region 转换为物理像素并配置 drawing buffer、viewport 和 scissor。
- GPU 后端内部必须在物理像素空间处理需要像素对齐的几何，不能把逻辑像素直接当作设备像素。
- DPR 来源只能是 viewport 状态；绘制模块不要自行读取 `window.devicePixelRatio`。
- Canvas2D context 在业务绘制前已按 DPR scale，业务代码不要重复缩放。

涉及线条和 region 的物理像素转换时，优先使用 `render/physicalLine.ts` 和
`render/physicalRegion.ts`，避免在业务 Renderer 中重复实现取整规则。

## 单帧调用链

```text
Chart.scheduleDraw(level)
  -> ChartRenderer.scheduleDraw
  -> FrameTransaction: capture -> derive -> seal -> render -> publish
  -> prepareFrameData
  -> sealFrameGeometry
  -> for each pane
       Renderer.beginFrame(region)
  -> Scene.paint(frame)            // 一次绘制所有 pane；逐 Layer 异常隔离
       -> Layer.paint(context)     // context = RenderContext + sceneRenderer
         -> Renderer.drawInstances/drawLines
         -> false 时 Canvas2D fallback
  -> Renderer.endFrame
  -> timeAxisLayer.paint
```

`UpdateLevel.Overlay` 只选择 overlay role，并复用缓存几何；`Main` 和 `All` 会重算主图几何。
Scene 不负责调用 `beginFrame/endFrame`，这个帧边界必须由 ChartRenderer 保证。

## 扩展方式

新增业务图形时，优先在 `engine/renderers` 中实现 Layer，调用
已有 Renderer 原语，并提供 Canvas2D fallback。只有现有原语无法表达且多个业务图形都会受益
时，才扩展 Renderer 契约。

新增后端时需要：

1. 实现 `SurfaceBackend` 的完整生命周期和逻辑像素 region 契约。
2. 实现 `Renderer`，准确声明 `caps`，不支持的绘制返回 `false`。
3. 接入 `RendererHostDependencies` 的 factory 和降级顺序。
4. 增加 contract、surface、renderer、fallback 和 DPR/物理像素测试。
5. 核心引擎设计发生变化时，在 `docs/design` 增加设计决策文档，并同步更新渲染管线文档。

## 测试

测试与实现放在同一子目录的 `__tests__` 中：

- `scene/__tests__`：Layer 注册、排序、过滤和 pane 分发。
- `render/__tests__`：Renderer 契约、Host 降级、三个后端、Surface、物理像素转换和帧指标。
- 能力探测测试位于 `foundation/utils/__tests__/rendererCapability.test.ts`。

运行 core package 测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```

跨 package 验证使用：

```bash
pnpm test:packages
```
