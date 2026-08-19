# Rendering 模块

`rendering` 提供图表绘制的通用基础设施，位于业务绘制代码与具体图形 API 之间。它负责组织
Scene/Layer、统一 Renderer 契约、管理 WebGPU/WebGL2/Canvas2D 后端，以及提供渲染能力检测
和帧预算等辅助能力。

完整的单帧时序、几何准备、Canvas 分层和 DPR 处理以
[`docs/rendering-pipeline.md`](../../../../docs/rendering-pipeline.md) 为准。本文只介绍本目录的
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

- K 线、指标、坐标轴等业务图形的具体绘制；这些代码位于 `engine/renderers` 和
  `engine/render/layers`。
- viewport、缩放、滚动和 DPR 状态；它们由 StateKernel 和 `ChartViewportManager` 维护。
- 帧几何计算；`ChartRenderer.prepareFrameData` 负责生成同一帧共享的几何快照。
- RendererPlugin 的注册和配置；这些元数据由 `foundation/plugin` 管理，实际 paint 调度由
  Scene 负责。

## 目录结构

| 目录             | 职责                                                      | 主链路状态                     |
| ---------------- | --------------------------------------------------------- | ------------------------------ |
| `scene/`         | 定义 Scene/Layer，按 pane 和 role 过滤并按 z 顺序绘制     | 已接入                         |
| `render/`        | 定义 Renderer/SurfaceBackend，提供三个后端及 RendererHost | 已接入                         |
| `renderer-tier/` | 同步检测环境能力，并从注册表选择可用 backend factory      | 独立能力，未接入 RendererHost  |
| `scheduler/`     | 按优先级、截止时间和队列上限调度帧内任务                  | 独立能力，未接入 ChartRenderer |

`scene/retainedScene.ts` 提供按 key/revision 保存图元节点的 retained 数据结构。目前它没有接入
主绘制链路；当前 Scene 仍在每帧调用可见 Layer 的 `paint`。

## Scene 与 Layer

`scene/types.ts` 定义两个核心契约：

- `Layer` 是独立绘制单元，声明 `id`、`role`、`paneRole`、`z` 和 `visible`，并实现
  `paint`、`dispose`。
- `Scene` 持有 Layer 集合，通过 `paintPane` 完成一次 pane 绘制。

`createScene()` 的绘制规则如下：

1. 只选择当前 `paneRole` 或 `global` 的 Layer。
2. 跳过 `visible === false` 的 Layer。
3. 可按 `LayerRole` 进一步过滤，例如 Overlay 帧只绘制 `overlay`。
4. 按 `z` 从低到高稳定排序，`z` 相同时保持注册顺序。
5. Scene dispose 后，所有公开操作都变为 no-op。

Layer role 包括 `background`、`primary`、`indicator`、`component`、`drawing` 和 `overlay`。
role 用于分组和增量绘制，最终叠放顺序仍以 `z` 为准。

旧式 `RendererPlugin` 通过 `createLayerFromPlugin()` 转换为 Layer。桥接层会把当前 Renderer
注入业务 `RenderContext.sceneRenderer`，因此插件不需要感知具体 GPU 后端。

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

`render/SurfaceBackend.ts` 管理底层 canvas/context，包括 resize、region 绑定、清屏、合成和
销毁。Renderer 管绘制原语，SurfaceBackend 管输出表面，两者不要互相承担职责。

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
       Scene.paintPane(context[, roles])
         -> Layer.paint
           -> Renderer.drawInstances/drawLines
           -> false 时 Canvas2D fallback
  -> Renderer.endFrame
  -> timeAxisLayer.paint
```

`UpdateLevel.Overlay` 只选择 overlay role，并复用缓存几何；`Main` 和 `All` 会重算主图几何。
Scene 不负责调用 `beginFrame/endFrame`，这个帧边界必须由 ChartRenderer 保证。

## 辅助模块

### renderer-tier

`renderer-tier` 把渲染能力定义为：

```text
webgpu > webgl2 > canvas2d > none
```

`detectRendererTier()` 只进行同步预检；WebGPU 检测不会调用异步 `requestAdapter()`，真正创建
后端时仍可能失败。`selectBackend()` 则在检测上限内，从调用方注册的 factories 中选择最高
可用实现，并支持 `minimum` 能力下限。

该模块目前没有参与 `RendererHost` 的实际降级流程，而且 tier 名称
`webgpu/webgl2/canvas2d` 与 Host 的 backend 名称 `webgpu/webgl/canvas` 不完全相同。接入前
需要先统一模型，不能并行维护两套后端选择状态。

### scheduler

`createFrameBudget()` 提供高、中、低优先级任务队列、同 id 合并、deadline 截止和帧耗时统计。
它适合可分片、允许跨帧完成的工作，不应替代保证原子快照的 FrameTransaction。当前
ChartRenderer 未使用它。

### retainedScene

`createRetainedScene()` 按节点 key 保存 rects、lines 和 band，使用 revision 表达数据版本，并
可按 pane 收集、按 z 排序和清理过期节点。它是后续 retained rendering 的数据基础，目前不
参与 `createScene()` 的即时 Layer paint。

## 扩展方式

新增业务图形时，优先在 `engine/render/layers` 或 `engine/renderers` 中实现 Layer/Plugin，调用
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

- `scene/__tests__`：Layer 注册、排序、过滤、Plugin 桥接和 retained 数据结构。
- `render/__tests__`：Renderer 契约、Host 降级、三个后端、Surface、物理像素转换和帧指标。
- `renderer-tier/__tests__`：能力探测和 backend factory 选择。
- `scheduler/__tests__`：优先级、合并、deadline 和队列限制。

运行 core package 测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```

跨 package 验证使用：

```bash
pnpm test:packages
```
