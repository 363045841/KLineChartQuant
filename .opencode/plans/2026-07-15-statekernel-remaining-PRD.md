# PRD: StateKernel 剩余状态迁移 — ChartZoomController & MarkerManager

## 背景

StateKernel 已完成 12 个子状态模块的迁移（zoom、data、viewport、pane、theme、drawing、interaction、dataManager、options、comparison、indicator、subPane）。当前仍有部分 Manager 持有独立状态，未纳入 kernel SSOT 体系。

## 目票

消灭 kernel 外部的影子状态，使所有业务状态变更都经过 kernel actions。

## 范围

### Phase 1 — ChartZoomController（P0）

**现状：**
- `zoomState` 已在 kernel（zoomLevel, kWidth, kGap 为 writable signal）
- `ChartZoomController` 仍持有 `currentZoomLevel`, `currentKWidth`, `currentKGap` 三个 plain field
- `chart.ts` 中的 `applyRenderState` 分支逻辑交叉读写两者，存在不一致风险

**目标：**
- `ChartZoomController` 降级为纯函数工具类（仅保留 `clampZoomLevel`, `computeKWidthKGap` 等计算）
- 所有状态读取通过 `kernel.zoom.readonly`，写入通过 `kernel.zoom.actions`
- 删除 `chart.ts` 中 `zoomController` 的中间层调用

### Phase 2 — MarkerManager（P1）

**现状：**
- 自定义标记（`CustomMarkerEntity[]`）存于 `MarkerManager` 内部 `Map`
- 触点标记（`VolumePriceMarker[]`）也是 plain field
- 增删改查走命令式 API，无 signal 通知

**目标：**
- `markerState.ts` 新增子状态模块，管理 `customMarkers`, `extremaMarkers`, `volumePriceMarkers`
- `MarkerManager` 变为 kernel 的投影器（类似 indicator/subPane 模式）
- 渲染器通过 `markerState.readonly.customMarkers$` 获取标记数据

### Phase 3 — DrawingStore & PaneLayout（P2）

- 审计 `DrawingStore` 与 `drawingState` 是否有重复持有
- `ChartPaneLayout` 的计算逻辑是否适合拆为 computed

## 非目标

- `PaneRenderer` canvas/yAxis 等渲染基础设施不进 kernel（属于副作用持有，非状态）
- `InteractionController` 内部瞬态（dragStartX 等）按计划保持 plain field

## 下一个大 PR 该处理的：渲染管线兼容层性能预研

### 当前管线结构

每帧每 pane，两条路径并行执行：

```
chartRenderer.renderPanes()
  ├─ rendererPluginManager.render(paneId, ctx)   // 旧路径: RendererPlugin.draw(ctx)
  │    ctx 含 mainCtx, candleWebGLSurface 等       // 直接 Canvas2D / GL
  │
  └─ sceneRenderer.beginFrame(region)
     scene.paintPane({ renderer, region })         // 新路径: Scene → Layer.paint()
     sceneRenderer.endFrame()
```

### 兼容层开销逐层量化

| 层 | 实现 | 开销判定 |
|---|---|---|
| `SurfaceBackend` | `createWebGLSurfaceBackend` 1:1 委托 `SharedWebGLSurface` | ✅ 零 — 纯直通 |
| `Renderer` 接口 | `createWebGLRenderer` 中 `drawInstances`/`drawLines` | ⚠️ 低 — WeakMap 查元数据 ~3 次 + `ArrayBuffer` → Float32Array reinterpret + `gl.bufferSubData` |
| `createLayerFromPlugin` | `paint()` 内调 `plugin.draw(getContext())` | ✅ 零额外 — 旧 plugin 包了一层 Layer 接口 |
| Scene dispatch | `paintPane()` filter + stable sort + loop | ✅ ~0.01ms（~15 layers） |

### 真实问题

**1. 双路径调度冗余** — 旧 `rendererPluginManager.render()` 和新 `scene.paintPane()` 每帧都跑。绘制内容不重叠（旧路径画副图指标/drawing，新路径画 candle/grid/crosshair），但维护两套 dispatch 循环增加了复杂度，没有复用。

**2. CPU 侧 buffer 搬用** — `createWebGLRenderer` 的 buffer 管理走 JS `ArrayBuffer` 中转：

```
writeBuffer(data) → 拷贝进 ArrayBuffer
drawInstances()   → new Float32Array(meta.data) → gl.bufferSubData
```

相比直接写入 WebGL buffer，多了一次显式的 CPU 拷贝和 GC pressure。

**3. `setFallbackContext` hack** — `(this.sceneRenderer as any).setFallbackContext(...)` 突破接口契约，fallback 到 Canvas2D 时逐 rect `fillRect`，性能差两个数量级。属于正常降级，但暴露了接口设计的缺口。

**4. Scene Layer 未真正使用 Renderer 抽象** — 当前 Scene 中的 Layer 仍然走 `plugin.draw(context)` 拿 `RenderContext`（旧式），`PaintContext.renderer` 被闲置。新的 Renderer 抽象（drawInstances/drawLines）仅被极少数 Layer（candle）使用。引入兼容层的架构收益（WebGPU 迁移）尚未兑现。

### 优化建议（按收益排序）

| 优先级 | 优化 | 预期效果 |
|--------|------|---------|
| P0 | 合并新旧 dispatch 为单一路径 | 消除每帧 filter + sort 冗余；降低维护负担 |
| P1 | `createWebGLRenderer` buffer 直接映射 `WebGLBuffer`，绕过 `ArrayBuffer` 中间层 | 省一次 CPU 拷贝 + GC pressure |
| P2 | `drawLines` 中 `buildJoinedPolylineGeometry` 法线计算加入 geometry cache | 厚线（width > 1）渲染场景有明显提升 |
| P3 | 移除 `setFallbackContext`，Layer 统一走 `Renderer` 接口 | 架构干净，使 WebGPU 迁移路径可行 |

### 当前结论

渲染兼容层本身的抽象开销**可忽略**。真正瓶颈是：
- 双路径并行导致的**冗余调度**
- CPU 侧 `ArrayBuffer` 兜转引入的**不必要的拷贝**

这两项修复后，管线具备承载 WebGPU 后端的能力，且不影响现有 Canvas2D 降级路径。

## 验收标准

- `git grep 'private.*currentZoomLevel\|private.*currentKWidth\|private.*currentKGap' packages/core/src/engine/` → 零返回
- `ChartZoomController` 不再有 `.setZoomLevel()` 等写入方法
- `MarkerManager` 不再持有 `customMarkers` `Map`
- `pnpm -r test` 全绿
