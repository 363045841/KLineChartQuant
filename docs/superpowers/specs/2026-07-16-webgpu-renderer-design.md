# WebGPU Renderer MVP 设计

日期：2026-07-16

## 1. 目标

在现有 Scene + Renderer 单路径架构上新增 WebGPU 后端，使已经通过 Renderer 原语绘制的 K 线、矩形柱、折线指标和填充带无需修改业务渲染器即可切换到 WebGPU。

首版交付渲染等价 MVP：

- 实现 rectangle instances、line strips、band fill。
- 支持 WebGPU、WebGL、Canvas 三种用户偏好。
- 支持运行时原子热切换。
- WebGPU 初始化失败或 device lost 时自动降级到 WebGL；WebGL 不可用时降级到 Canvas2D。
- 保留偏好后端与有效后端两个独立状态。

## 2. 非目标

首版不包含：

- compute shader、storage buffer ring buffer 或 GPU 聚合。
- Volume Profile、Order Book Heatmap、Footprint 的 compute 接入。
- 把 grid、crosshair、坐标轴、分时、对比线、drawing、marker、legend 等 Canvas2D 内容迁移到 GPU。
- direct-to-screen WebGPU 合成；首版继续使用 GPU canvas 到 2D canvas 的合成模型。
- 通用材质、shader graph 或 3D 渲染抽象。
- WebGPU buffer arena/pool 性能优化。

## 3. 现状与约束

当前生产 GPU 路径已经统一为：

```text
Scene.paintPane
  -> Layer.paint
  -> RendererPlugin.draw
  -> context.sceneRenderer
  -> drawInstances / drawLines
  -> surface.compositeTo
```

业务侧通过以下 helper 使用原语：

- drawCandlesViaRenderer：K 线 body/wick。
- tryDrawRectsGpu：volume、MACD bar。
- tryDrawLinesGpu：多数折线指标。
- tryDrawFilledBandGpu：BOLL、ENE band。

Canvas2D 是业务层 fail-closed fallback。Renderer 返回 false 时，业务渲染器执行现有 2D 绘制。

现有 ChartRenderer 在构造函数中直接创建 WebGL Renderer。WebGPU 初始化需要异步 requestAdapter/requestDevice，但 createChartController 已经是 async，Vue mount API 也接受 Promise，因此不需要破坏公开挂载 API。

## 4. 总体架构

采用 RendererHost 原子热切换方案。

```text
settings.rendererBackend (preference)
              |
              v
        RendererHost.switchTo()
              |
       prepare backend async
              |
      atomic active swap + redraw
              |
              v
ChartRenderer -> RendererHost.renderer -> WebGPU | WebGL2 | Canvas fallback
```

RendererHost 是后端资源生命周期的唯一所有者。后端偏好仍以 StateKernel 的 settings.rendererBackend 为唯一真源，host 只接收切换命令并发布运行态。ChartRenderer 不再构造具体后端，只从 host 获取当前 Renderer。Scene、Layer 和指标只依赖 Renderer 契约。

### 4.1 组件边界

#### RendererHost

职责：

- 持有当前有效 Renderer。
- 根据传入偏好创建 WebGPU、WebGL 或 Canvas fallback，不保存第二份持久偏好。
- 管理异步初始化、并发切换、原子替换和资源销毁。
- 监听 WebGPU device lost。
- 更新有效后端、状态和错误信息。
- 切换完成后请求完整重绘。

RendererHost 不负责业务绘制、不维护 Scene、不解释 indicator 配置。

建议公开形状：

```ts
export type RendererBackend = 'webgpu' | 'webgl' | 'canvas'

export type RendererBackendStatus =
  | 'initializing'
  | 'ready'
  | 'switching'
  | 'degraded'
  | 'failed'

export type RendererBackendRuntime = {
  preference: RendererBackend
  effective: RendererBackend
  status: RendererBackendStatus
  error: string | null
}

export interface RendererHost {
  readonly renderer: Renderer
  readonly runtime: Omit<RendererBackendRuntime, 'preference'>
  switchTo(preference: RendererBackend): Promise<void>
  dispose(): void
}
```

preference 由 settings Signal 提供；runtime 的实际外部暴露应通过 StateKernel readonly Signal。上面的同步结构用于说明 host 内部契约，不允许形成第二个偏好状态源。

#### createWebGPURenderer

职责：

- 实现 Renderer 契约。
- 管理 GPUDevice、GPUQueue、GPUCanvasContext、GPUBuffer、GPURenderPipeline、bind group 和 command encoder。
- 实现 candle、line、fill 三类 pipeline。
- 维护 pipeline cache 和 device-lost 通知。

它不复用 CandleWebGLSurface 或 LineWebGLSurface，也不把 WebGPU 细节暴露给业务渲染器。

#### createWebGPUSurfaceBackend

职责：

- 管理隐藏共享 canvas 与 GPUCanvasContext。
- 配置 preferred canvas format 和 premultiplied alpha。
- 维护逻辑尺寸、DPR、pane region、viewport 和 scissor。
- 把 GPU canvas 指定 region 合成到目标 2D canvas。

#### createCanvas2DRenderer

这是 Renderer 契约的 fail-closed 实现，而不是第二套 Canvas2D 原语系统：

- caps.name 为 canvas2d。
- surface.isAvailable 返回 false。
- drawInstances 和 drawLines 返回 false。
- 业务渲染器因此自然进入现有 Canvas2D fallback。

## 5. 初始化与后端选择

### 5.1 初始挂载

createChartController 在构造 Chart 前读取 settings.rendererBackend，并等待 RendererHost 初始化：

```text
preference=webgpu
  requestAdapter
  requestDevice
  configure WebGPU surface
  success -> effective=webgpu
  failure -> create WebGL2
             success -> effective=webgl, status=degraded
             failure -> effective=canvas, status=degraded

preference=webgl
  create WebGL2
  success -> effective=webgl
  failure -> effective=canvas, status=degraded

preference=canvas
  create Canvas fallback -> effective=canvas
```

host 准备完成后才构造 Chart，避免首帧拿到未初始化 Renderer。

### 5.2 运行时热切换

每个切换请求分配递增 generation：

1. 保存新的 preference，状态设为 switching。
2. 旧 Renderer 继续绘制。
3. 后台创建目标 Renderer。
4. 只有最新 generation 可以提交替换。
5. 过期创建结果立即 dispose。
6. 成功时原子替换 active Renderer，更新 effective/status/error。
7. 请求 UpdateLevel.All。
8. 销毁旧 Renderer。

切换失败时：

- 如果旧 Renderer 仍可用，继续使用旧 Renderer，并记录 degraded/error。
- 如果旧 Renderer 不可用，按 WebGPU -> WebGL -> Canvas 顺序降级。

### 5.3 Device lost

- 仅当前 active generation 对应的 device lost 事件有效。
- device lost 后创建 WebGL Renderer；成功则原子替换并完整重绘。
- WebGL 也不可用时切换到 Canvas fallback。
- preference 保持 webgpu，不自动循环重试，避免失败风暴。
- 用户重新选择 WebGPU或下次挂载时可以再次尝试。

### 5.4 Dispose

- 标记 host disposed 并推进 generation，使所有待完成任务失效。
- 销毁当前 Renderer。
- 异步迟到的 Renderer 创建完成后必须立即 dispose。
- device lost callback 在 disposed 后不得更新状态或触发重绘。

## 6. 状态设计

偏好与运行态分开：

- settings.rendererBackend：用户持久偏好，取值 webgl | webgpu | canvas。
- renderer runtime state：effectiveBackend、backendStatus、backendError。

所有写入通过 StateKernel Action；外部只获得 ReadonlySignal。降级不改写 preference。

设置 UI 的后端下拉显示 preference。旁边显示 effective backend 和 switching/degraded 状态。例如 preference 为 WebGPU、effective 为 WebGL 时，用户能看到当前实际使用 WebGL，但下次仍会尝试 WebGPU。

## 7. 设置迁移

删除运行时 ChartSettings.enableWebGLRendering，替换为 rendererBackend，默认 webgl，以保持现有默认行为。

仅对已持久化 localStorage 做一次迁移：

- enableWebGLRendering === true -> rendererBackend = webgl
- enableWebGLRendering === false -> rendererBackend = canvas
- rendererBackend 已存在时以新字段为准

迁移后保存新结构；生产运行时代码不保留旧字段或双重判断。

tryDrawLinesGpu、tryDrawRectsGpu 和 tryDrawFilledBandGpu 删除 enableWebGLRendering 分支，只根据当前 Renderer 的返回值决定是否走 Canvas2D。

## 8. WebGPU Surface 与合成

每个 Chart 使用一个隐藏共享 WebGPU canvas：

- format：navigator.gpu.getPreferredCanvasFormat()。
- alphaMode：premultiplied。
- usage 至少包含 RENDER_ATTACHMENT；若浏览器合成路径需要，再加入 COPY_SRC。
- canvas backing size 由逻辑尺寸和 DPR 决定。

每个 pane 使用物理像素 viewport/scissor。首版保持当前即时合成语义：业务原语成功提交后立刻 surface.compositeTo 对应 2D canvas。这样可以保持 GPU 内容与 Canvas2D Layer 的既有 z-order。

不采用 direct-to-screen canvas，因为当前每个 pane 的 GPU 与 2D 内容存在交错顺序，直接放置一个 WebGPU DOM canvas 会改变合成语义。

## 9. WebGPU 原语映射

### 9.1 Rectangle instances

对应 Renderer.drawInstances，首版仅接受 candle pipeline：

- vertex shader 使用 vertex_index 生成六个 unit-quad 顶点。
- instance buffer 布局为 x、y、width、height，均为 f32。
- uniform 包含 logical resolution、scrollLeft 和 color。
- fragment shader 输出 premultiplied alpha 兼容颜色。

服务对象包括 K 线 body/wick、volume bar 和 MACD bar。

### 9.2 Line strips

对应 Renderer.drawLines 的 strips：

- 所有 strips 在同一个 render pass 中提交，render pass 只 clear 一次。
- 每条 strip 可有独立 color 和 width。
- 1px 线使用 line-strip topology。
- 宽线抽取并复用现有 joined-polyline CPU tessellation，使用 triangle-list 绘制。
- 首版保持 round/join 视觉与 WebGL2 现状一致，不引入几何 shader 假设。

### 9.3 Filled band

对应 fill pipeline：

- 输入为交错 upper/lower 顶点。
- 使用 triangle-strip。
- color 由 uniform 提供。
- alpha 仍通过 composite options 应用，保持 BOLL/ENE 当前行为。

### 9.4 MSAA

- 默认请求 4x MSAA。
- 根据设备支持选择有效 sample count。
- 每个 region 使用 multisampled color texture，resolve 到当前 canvas texture。
- line strips 必须在单 render pass 内完成，避免逐条 clear 覆盖。

### 9.5 Compute

MVP 中：

- caps.compute = false。
- caps.storageBuffer = false。
- createComputePipeline 和 dispatchCompute 抛出明确不支持错误。

第二阶段实现 compute 后再修改 capability，避免声明未交付能力。

## 10. 资源生命周期

### 10.1 Pipeline

pipeline 按 canvas format、sample count 和 type(candle | line | fill) 缓存。业务 helper 当前每帧调用 createPipeline/destroyPipeline，因此 WebGPU createPipeline 返回引用缓存实体的轻量 handle，destroyPipeline 只释放 handle，不重复编译 WGSL。

### 10.2 Buffer

MVP 中 BufferHandle 对应真实 GPUBuffer：

- createBuffer 根据 usage 和 size 创建 GPUBuffer。
- writeBuffer 使用 queue.writeBuffer。
- destroyBuffer 在相关提交完成后延迟销毁，不能在 GPU 尚未消费时立即使资源失效。

现有 helper 每帧创建资源会造成分配压力。MVP 先记录 buffer allocation、uploaded bytes 和 draw submissions，验收正确性。frame arena、pool 或持久业务 buffer 作为后续性能任务，不在首版同时解决，以免引入 reuse race。

### 10.3 Pipeline/Buffer handle 校验

所有 handle 由创建它的 Renderer 实例拥有。后端切换后，旧 handle 不得用于新 Renderer。当前业务 helper 的资源只在单次调用内存活，因此天然满足该约束。

## 11. 错误语义

Renderer.drawInstances/drawLines 返回 boolean 的语义保持 fail-closed：

- 参数无效、handle 不匹配、region 未绑定、device 已 lost 或命令无法记录时返回 false。
- 同步异常在后端内捕获并返回 false。
- queue.submit 后的异步设备故障不能伪装成同步 false，统一由 device.lost 流程处理。
- adapter/device/context/pipeline 初始化错误标准化为 renderer backend error，进入 host 降级流程。

单个 Layer 不负责捕获后端生命周期错误。Layer 只根据 draw 返回值选择 Canvas2D fallback。

## 12. Chart 与 UI 接线

### 12.1 Core

- createChartController 异步创建 RendererHost，再构造 Chart。
- Chart 和 ChartRenderer 接收 host/renderer 依赖，不再直接创建 SharedWebGLSurface 或 createWebGLRenderer。
- ChartRenderer 每帧读取 host.renderer；切换后下一帧自然使用新后端。
- RendererHost 的状态变化通过 StateKernel Action 发布。

### 12.2 Vue 设置

- 把“启用 WebGL 硬件加速渲染”toggle 替换为 renderer backend Dropdown。
- 选项：WebGL、WebGPU、Canvas。
- confirm settings 后立即触发切换。
- 显示有效后端以及 switching/degraded 状态。
- React/Angular 继续通过 core controller 状态与设置协议获得相同行为，不在框架包内实现后端逻辑。

## 13. 测试策略

### 13.1 Contract tests

共享 Renderer contract tests 验证：

- buffer/pipeline handle 生命周期。
- drawInstances、drawLines 成功与 fail-closed。
- dispose 幂等。
- compute capability 与抛错行为一致。

WebGL2 和 WebGPU fake device 均执行适用的 contract tests。

### 13.2 WebGPU unit tests

使用 fake navigator.gpu、GPUAdapter、GPUDevice、GPUQueue 和 GPUCanvasContext，覆盖：

- adapter/device/context 初始化。
- rectangle instance pipeline 和 WGSL/bindings。
- batched strips 单 pass、单 clear。
- fill triangle-strip。
- MSAA resolve。
- region、viewport、scissor 和 DPR。
- pipeline cache。
- 延迟 buffer 销毁。
- device lost 通知和 dispose。

### 13.3 RendererHost tests

覆盖：

- 三种偏好的正常初始化。
- WebGPU -> WebGL -> Canvas 降级。
- 热切换时旧后端继续可用。
- generation 竞态与 stale result dispose。
- device lost 仅影响当前 generation。
- dispose 期间异步初始化迟到。
- preference 与 effective 分离。

### 13.4 State/UI tests

覆盖：

- 旧 enableWebGLRendering 持久设置迁移。
- rendererBackend 默认值与三选项。
- 设置确认触发热切换。
- preference/effective/status/error 展示。

### 13.5 浏览器验收

在支持 WebGPU 的 Chromium 上验证 WebGPU、WebGL、Canvas 三档：

- candle。
- MA/多周期折线。
- BOLL/ENE band。
- volume。
- MACD bar + DIF/DEA。
- 多 pane、不同 DPR、resize、缩放和滚动。
- 连续快速切换后端无空白帧或资源泄漏。
- 模拟 device lost 后继续通过 WebGL/Canvas 绘制。

截图/像素比较以 WebGL2 为基准设置合理容差，不要求不同抗锯齿实现逐像素完全相同。

## 14. 依赖与类型

- 使用原生 WebGPU API。
- 增加 @webgpu/types 作为开发依赖并接入 core tsconfig。
- MVP 不引入 webgpu-utils；当 compute/uniform schema 复杂度实际出现时再评估。
- 不引入 Three.js 或通用 3D 引擎。

## 15. 交付分段

### A. 契约与状态

- renderer backend preference/runtime 类型。
- Canvas fallback Renderer。
- RendererHost 生命周期与 fake backend tests。
- 设置持久化迁移。

### B. WebGPU Surface

- adapter/device/context 初始化。
- shared canvas、DPR、region、compositeTo。
- device lost 和 dispose。

### C. WebGPU 绘制原语

- rectangle instances。
- line strips + MSAA。
- filled band。
- contract/unit tests。

### D. Chart 与 UI 接线

- createChartController/ChartRenderer 注入。
- runtime hot switch。
- Vue dropdown 与 effective state。
- WebGPU -> WebGL -> Canvas 降级。

### E. 验收与性能基线

- package tests、type-check、build。
- 三后端浏览器视觉验收。
- buffer allocation、uploaded bytes、submission count 基线。
- 记录后续 buffer arena 和 compute 工作，不在 MVP 内扩 scope。

## 16. 完成标准

- 用户可以在设置中选择 WebGL、WebGPU 或 Canvas，并在当前图表立即生效。
- 已迁 Renderer 原语的业务渲染器无需按后端分支。
- WebGPU 下 candle、line、fill、volume、MACD 与 WebGL2 视觉等价。
- WebGPU 不可用、初始化失败或 device lost 时图表不中断并自动降级。
- preference 与 effective backend 可观察且不会互相覆盖。
- 无旧 enableWebGLRendering 运行时分支。
- 单元、包级、类型和构建验证通过。
