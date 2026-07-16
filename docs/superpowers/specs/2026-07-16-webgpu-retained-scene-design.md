# WebGPU Retained Scene 与性能优化设计

日期：2026-07-16

## 1. 目标

在 WebGPU 渲染等价 MVP 已可用的前提下，将当前“每原语临时 buffer + 多次 submit + GPU→2D drawImage”路径升级为 chart 级 Retained Scene + 混合 DOM 分层，使 WebGPU 在标准与重载两档负载下先达到不慢于 WebGL，再把 p95 渲染耗时相对 WebGL 降低约 30%。

交付目标：

- 业务 layer 以稳定 key 更新 SceneNode，不再每帧创建/销毁 GPU handle。
- 每 RAF 每个 chart 原则上只 `queue.submit` 一次。
- WebGPU 可见 DOM canvas 直接覆盖 plot 区；取消 GPU canvas 到 pane mainCanvas 的 `drawImage`。
- 保留 Canvas2D underlay / overlay 与现有 fail-closed 语义。
- 保留 RendererHost 热切换、preference/effective 分离与 WebGPU→WebGL→Canvas 降级。

## 2. 非目标

本设计不包含：

- compute shader、storage buffer ring、GPU 聚合或 downsampling。
- Volume Profile / Order Book Heatmap / Footprint 的 GPU compute 接入。
- 文字、坐标轴、legend、marker、drawing、crosshair 迁移到 WebGPU。
- 第一阶段强制 WebGL 同步改为 RetainedScene 消费者。
- 跨 chart 共享 GPU 资源。
- 通用材质系统、shader graph 或 3D 抽象。

## 3. 背景与问题

当前 WebGPU MVP 正确性路径为：

```text
Scene.paintPane
  -> Layer.paint
  -> drawInstances / drawLines
  -> 每调用 createBuffer / writeBuffer / createUniform
  -> 每调用 beginRenderPass + queue.submit
  -> surface.compositeTo (drawImage 到 2D)
```

相对 WebGL 的结构性开销：

1. 每 batch 独立 command encoder 与 submit。
2. 每帧临时 GPUBuffer 与延迟 destroy。
3. 每 draw 新建 uniform buffer / bind group。
4. 4x MSAA resolve 后仍 `drawImage` 回 2D。
5. 宽线几何仍由 CPU 每帧生成。

MVP 设计文档已明确 buffer arena、direct-to-screen、compute 属于后续阶段。本设计承接该后续阶段中的 retained scene 与混合分层部分。

## 4. 决策摘要

| 项 | 决策 |
|---|---|
| 目标策略 | 分阶段提升：先持平 WebGL，再冲击 p95 -30% |
| 验收负载 | 标准档 + 重载档 |
| 主线架构 | Retained Scene + FrameGraph + 混合 DOM 分层 |
| 合成边界 | Canvas2D underlay / WebGPU scene / Canvas2D overlay |
| WebGL 同步 | 第一阶段不强制；可继续即时合成 |
| API 兼容 | 保留 `drawInstances/drawLines` thin adapter，内部 upsert SceneNode |
| Compute | 明确排除 |

## 5. 总体架构

### 5.1 DOM 分层

每个 chart plot 区域采用三层：

```text
Canvas2D underlay   网格、背景分区
WebGPU scene canvas K 线、volume、MACD bar、均线、band fill
Canvas2D overlay    legend、marker、drawing、crosshair、标签
Axis canvases       左右轴、时间轴，保持现状
```

规则：

- WebGPU canvas 从隐藏共享 surface 变为 chart plot 区域内可见的 DOM canvas。
- 尺寸与 DPR 跟随 plotWidth × plotHeight；`pointer-events: none`。
- 多 pane 共用同一 WebGPU canvas，用 viewport/scissor 与 region.y 区分 pane。
- 不再调用 `surface.compositeTo` 把 GPU 像素复制到各 pane mainCanvas。
- underlay 画在 GPU 之下；overlay 画在 GPU 之上，保持现有 z-order 语义。

### 5.2 数据流

```text
Layer.paint
  -> upsert SceneNode(key, revision, geometry/material)
  -> FrameGraph.collect(pane)
  -> endFrame
       underlay 2D paint
       WebGPU encode all nodes (1 encoder, 1 submit)
       overlay 2D paint
```

### 5.3 组件边界

#### RetainedScene

职责：

- 以 `paneId/layerId/primitiveId` 为稳定 key 保存节点。
- 记录 revision、lastTouchedFrame、可见性。
- 提供 upsert / markMissing / collectVisible / prune。

不负责 GPU 资源、DOM、或业务指标计算。

#### FrameGraph

职责：

- 每个 RAF 收集所有 pane 的可见节点。
- 按 underlay / gpu / overlay 与 z-order 排序。
- 驱动 underlay/overlay Canvas2D 与 WebGPU encoder。
- 保证每帧一次 submit（无 draw 时可 0 次）。

#### WebGPU ResourceTable

职责：

- `key -> { buffer, capacity, lastRevision, pipelineKind }`。
- revision 未变只更新 uniform；变了才 upload 或扩容。
- stale 节点回收；host dispose / 热切换时整表销毁。

#### Renderer thin adapter

职责：

- 现有 `drawInstances/drawLines` 在 beginFrame/endFrame 之间 upsert 节点，不立即 submit。
- 使 candle/lines/rects helper 可渐进迁移，不必一次改完业务层。

## 6. Scene 节点模型

```ts
type SceneNodeKey = string // `${paneId}/${layerId}/${primitiveId}`

type RectsNode = {
  kind: 'rects'
  key: SceneNodeKey
  revision: number
  instances: Float32Array // x,y,w,h
  count: number
  color: string
  scrollLeft: number
  z: number
  paneId: string
}

type LinesNode = {
  kind: 'lines'
  key: SceneNodeKey
  revision: number
  strips: ReadonlyArray<{
    points: ReadonlyArray<{ x: number; y: number }>
    color: string
    width?: number
  }>
  scrollLeft: number
  z: number
  paneId: string
}

type BandNode = {
  kind: 'band'
  key: SceneNodeKey
  revision: number
  upper: ReadonlyArray<{ x: number; y: number }>
  lower: ReadonlyArray<{ x: number; y: number }>
  color: string
  alpha: number
  scrollLeft: number
  z: number
  paneId: string
}

type SceneNode = RectsNode | LinesNode | BandNode
```

### 6.1 稳定 key 约定

示例：

- `main/candle/upBody`
- `main/candle/downWick`
- `main/ma/ma5`
- `main/boll/band`
- `MACD_0/macd/histUp`

同一指标同一批次跨帧必须复用同一 key。

### 6.2 revision 规则

- 几何内容变化：revision +1。
- 颜色 / alpha 变化：revision +1 或 materialRevision +1；实现可合并到 revision。
- 仅 `scrollLeft`、viewport、region 变化：不改 revision，只更新 uniform。
- 业务 helper 可用内容 hash 或“输入引用 + 参数签名”生成 revision；不得每帧无条件 +1。

### 6.3 回收规则

- 节点本帧被 upsert：`lastTouchedFrame = currentFrame`。
- 某 key 本帧未 touch：标记 stale。
- 连续 N 帧 stale（默认 N=2）或 layer dispose：从 Scene 删除并销毁 GPU 资源。
- 后端热切换：旧 ResourceTable 全部 destroy；新 backend 按当前 SceneNode 重建。

## 7. FrameGraph 与合成

### 7.1 LayerRole 分流

沿用现有 `LayerRole`：

| Role | 目标层 |
|---|---|
| background | underlay 2D |
| primary | WebGPU |
| indicator | WebGPU |
| component | 第一阶段仍 2D 或现有路径；后续可迁 GPU |
| drawing | overlay 2D |
| overlay | overlay 2D |

第一阶段 GPU 必迁：candle、volume/MACD rects、MA 类 lines、BOLL/ENE band。

### 7.2 帧生命周期

```text
ChartRenderer.draw
  frameGraph.beginChartFrame()
  for each pane:
    clear underlay/overlay as needed
    beginFrame(region)          // bind region, no submit
    scene.paintPane(...)        // 2D underlay/overlay paint 或 upsert GPU nodes
    endFrame()                  // pane 结束；仍不 submit
  frameGraph.flushChartFrame():
    prune stale nodes
    encode all GPU nodes once
    queue.submit once           // 0 或 1
```

约束：

- `beginFrame` 绑定 region；`drawInstances/drawLines` 只 upsert，禁止 submit。
- 提交点唯一：`flushChartFrame`（所有 pane paint 之后）。
- 多 pane 共用一个 encoder；每个 pane 设置自己的 viewport/scissor。
- MSAA：每个 pane 一个 render pass 可接受；禁止每个原语一个 pass + submit。
- 每个 pane 的首个 pass clear 该 scissor 区域，同 pane 后续 draw 使用 load。

### 7.3 与现有即时合成语义的关系

当前业务在 GPU 成功后立即 `compositeTo`，是为了与 2D layer 交错兼容。混合 DOM 分层后：

- WebGPU 路径删除即时 `compositeTo`。
- underlay 先画、GPU 中层、overlay 后画，由 DOM 顺序保证。
- WebGL 在未实现 retained/DOM 分层前可继续即时合成，避免双后端同时大改。

## 8. WebGPU 资源与编码

### 8.1 ResourceTable

```ts
type GpuResource = {
  buffer: GPUBuffer
  capacity: number
  lastRevision: number
  kind: 'rects' | 'lines' | 'band'
}
```

- 扩容策略：需要时按 1.5x 或 nextPowerOfTwo 增长，禁止每帧缩到精确大小。
- uniform：使用 frame ring buffer 或少量可复用 uniform slot；禁止每 draw `createBuffer + deferDestroy`。
- pipeline cache：继续按 type/format/sampleCount 缓存。

### 8.2 编码顺序

每个 pane 内按 z 升序绘制 GPU 节点：

1. rects（candle body/wick、volume、MACD）
2. bands
3. lines

跨 pane 按 pane top 顺序编码。整帧结束后一次 submit。

### 8.3 宽线几何

第一阶段继续 CPU tessellation。可对 `points 引用 + width` 做几何缓存，类似 WebGL `geoCache`，避免滚动时重复生成。

## 9. Chart / Host 接线

### 9.1 Chart DOM

- `ChartDom` 或 plot 容器增加 `gpuCanvas`（或由 RendererHost 拥有并挂到 canvasLayer）。
- resize 时 `rendererHost.resize(plotWidth, plotHeight, dpr)` 同步 GPU canvas 物理尺寸与 CSS 尺寸。
- 热切换到非 WebGPU 时隐藏 GPU canvas；切回时显示并重建 ResourceTable。

### 9.2 RendererHost

扩展职责：

- 记录 last surface size（已有）。
- 切换后端时迁移 size，并清空/重建 retained GPU 资源。
- 发布 runtime status；不保存第二份 preference。

### 9.3 业务 helper 迁移

渐进顺序：

1. thin adapter：现有 helper 不改签名，内部 upsert。
2. candle / rects / lines / band 改为显式 SceneNode key。
3. 删除 WebGPU 路径上的 `compositeSceneRenderer` 调用。

Canvas fallback 与 fail-closed 保持：GPU 节点 upsert/encode 失败时，对应 layer 仍可走 2D。

## 10. 性能基线与验收

### 10.1 负载定义

标准档：

- 约 500–1000 根 K 线
- 主图 MA + BOLL
- 2 个副图（如 MACD、RSI）
- 常见 DPR（1 或 1.25/1.5）

重载档：

- 更大可见区间或更多指标
- 多 pane
- 高 DPR
- 连续拖动 / 缩放

### 10.2 指标

每帧采集：

- `cpuPrepareMs`
- `gpuSubmitMs` 或 encode 时长
- `queueSubmitCount`
- `bufferCreateCount`
- `bufferUploadBytes`
- `drawCallCount`
- `compositeCount`（WebGPU 目标为 0）
- `jsHeapDelta`（可选）

对比对象：同负载 WebGL 与 WebGPU。

### 10.3 门槛

| 里程碑 | 门槛 |
|---|---|
| M0 Baseline | 指标可采集；标准/重载场景可复现 |
| M1 Retained + single submit | WebGPU 不慢于 WebGL；submit≈1；bufferCreate 接近 0 |
| M2 Hybrid DOM | WebGPU `compositeCount=0`；视觉等价；p95 相对 WebGL ≤ 0.7 |
| M3 Hardening | 热切换/device lost/resize/多 pane 无泄漏；回归测试绿 |

“不慢于 WebGL”定义为同负载 p95 帧耗时 ≤ WebGL × 1.05。  
“p95 -30%”定义为同负载 p95 帧耗时 ≤ WebGL × 0.7。

## 11. 里程碑

### M0 — Baseline harness

- 增加 frame metrics 探针（dev-only 或 test hook）。
- 固定标准/重载场景脚本或手动 checklist。
- 记录当前 MVP 的 submit/upload/create 基线。

### M1 — Retained resources + single submit

- 实现 RetainedScene 与 ResourceTable。
- `drawInstances/drawLines` 改为帧内录制，endFrame 统一 submit。
- uniform ring / 复用 buffer。
- 删除每原语 create+destroy 路径。
- 仍可暂时保留 compositeTo，以保证视觉不回归。

### M2 — Hybrid DOM composition

- 挂载可见 WebGPU canvas 到 plot 容器，位于 underlay 之上、overlay 之下。
- underlay/overlay 按 LayerRole 分流。
- 删除 WebGPU 路径 `compositeTo`。
- pane `mainCanvas` 仅绘制 underlay（background）；GPU 原语不再写入 mainCanvas。
- overlay 继续使用现有 `overlayCanvas`。
- 浏览器视觉验收与 p95 门槛。

### M3 — Hardening

- Host 热切换重建资源。
- device lost 清表并降级。
- stale 回收与泄漏测试。
- 文档与 plan 关闭条件核对。

## 12. 测试策略

### 12.1 单元

- RetainedScene upsert / revision / prune。
- ResourceTable upload-on-revision-only、capacity growth、destroy。
- FrameGraph 单 submit、多 pane scissor、clear/load 语义。
- thin adapter 把 drawInstances/drawLines 转为节点。

### 12.2 集成 / 契约

- candle、rects、lines、band 在 retained 路径下 fail-closed。
- 后端切换后旧 handle/node 不泄漏到新 backend。
- resize 后 region/DPR 正确。

### 12.3 浏览器验收

- WebGPU 与 WebGL 视觉对比：candle、MA、BOLL、volume、MACD、多 pane。
- 拖动/缩放时折线跟随 scrollLeft。
- 快速热切换无空白帧。
- 标准/重载档 metrics 达标。

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| DOM 分层改变 z-order | 严格按 role 分流；overlay 保留 2D；视觉对照 WebGL |
| 多 pane 共用 GPU canvas 坐标错误 | region.y + scissor/viewport 单测与浏览器验收 |
| revision 每帧抖动导致无收益 | 强制“滚动不改 revision”测试 |
| WebGL 与 WebGPU 行为分叉 | 契约测试共享；WebGL 暂保留旧路径但 API 兼容 |
| 一次改动过大 | 严格 M0→M3；每里程碑可回退 |

## 14. 完成标准

- WebGPU 路径每帧 `queueSubmitCount` 在正常绘制时为 1。
- 稳态滚动时 `bufferCreateCount` 接近 0，upload 仅发生在几何变化。
- WebGPU 无 GPU→2D `compositeTo`。
- 标准档与重载档达到第 10 节门槛。
- 热切换、device lost、dispose 无资源泄漏。
- 相关 unit/package/build 验证通过；浏览器视觉验收通过。
