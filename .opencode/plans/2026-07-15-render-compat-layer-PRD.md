# PRD: 渲染管线兼容层拆除 — 单路径 Scene + Renderer

**日期：** 2026-07-15  
**状态：** Draft  
**前置：** StateKernel A/B/C 已收口（见 `2026-07-15-statekernel-remaining-PRD.md`）  
**关联调研：** 同日兼容层问题调研（双路径 / Manager 边界 / Renderer 闲置）

---

## 1. 背景

StateKernel 业务 SSOT 迁移已基本完成。渲染侧仍处在 **新旧双路径并存** 的过渡态：

```
chartRenderer.renderPanes()
  ├─ rendererPluginManager.render(paneId, ctx)   // 旧：RendererPlugin.draw(RenderContext)
  └─ scene.paintPane({ renderer, region, ... }) // 新：Layer.paint(PaintContext)
```

内置绘制（candle / grid / crosshair / markers / drawing / 主副图指标）已通过 `createLayerFromPlugin` 挂到 Scene，并在 Manager 侧 `setEnabled(false)` 避免双画。但：

1. **每帧仍跑两套调度循环**（复杂度税）
2. **enabled 双写**（Manager + Layer visibility）
3. **外部 `chart.useRenderer()` 仍只走旧路径**
4. **生产代码几乎不调用 `Renderer.drawInstances` / `drawLines`**，真实 WebGL 走 `RenderContext.candleWebGLSurface` / `lineWebGLSurface`，`PaintContext.renderer` 闲置
5. **WebGPU 迁移路径尚未兑现**

兼容层抽象本身的帧开销可忽略；真正问题是 **架构未闭环** 与 **边界混乱**。

---

## 2. 目标

### 2.1 产品 / 架构目标

1. **单路径绘制调度**：每帧只走 `Scene.paintPane`；不再存在与之并行的 `RendererPluginManager.render` 主路径。
2. **职责边界清晰**：
   - StateKernel = 业务 SSOT
   - Managers = 投影器 / 帧 runtime / 副作用（无影子业务状态）
   - ChartRenderer = 帧编排（prepare → clear → context → scene → composite）
   - Scene / Layer = 绘制模块组合与 z-order 调度
   - Renderer backend = GPU/Canvas 原语（WebGL 现役，WebGPU 可替换）
3. **Renderer 抽象落地**：新 Layer（至少 candle / line 类）经 `PaintContext.renderer` 发令，不再绑 `RenderContext.*WebGLSurface`。
4. **外部插件 API 不破坏语义**：`useRenderer` / `removeRenderer` / `setRendererEnabled` 仍可用，内部实现改为 Scene 桥接。

### 2.2 非目标

- 本 PRD **不** 实现完整 WebGPU backend（只保证接口与路径可承载）。
- **不** 把 canvas / yAxis / RAF 等渲染基础设施塞进 kernel。
- **不** 重做指标计算 / DataManager / Viewport 业务逻辑。
- **不** 改动 StateKernel 子模块划分（SSOT 已收口）。
- Interaction 瞬态（dragStart 等）继续 plain field。

---

## 3. 现状审计（2026-07-15 代码事实）

### 3.1 双路径事实

| 类别 | 注册 | 实际绘制 |
|------|------|----------|
| core layers（grid/candle/markers/crosshair/yAxis…） | 仅 `scene.addLayer` | Scene |
| drawing / drawingLabel | Manager + Scene，Manager `enabled=false` | Scene |
| 主图/副图指标 | `useRenderer` + `setEnabled(false)` + Layer | Scene |
| 外部 `chart.useRenderer()` | 仅 Manager | **旧路径** |

结论：内置 **不双画**；旧路径对内置多是 **空转 filter**；外部插件仍依赖旧路径。

### 3.2 兼容层开销

| 层 | 判定 | 说明 |
|----|------|------|
| `SurfaceBackend` | 零额外 | 1:1 委托 `SharedWebGLSurface` |
| `createLayerFromPlugin` | 零额外 | `plugin.draw(getContext())` |
| Scene filter+sort | 可忽略 | ~15 layers |
| 双 dispatch | 复杂度为主 | 绘制不双倍，维护成本高 |
| `createWebGLRenderer` ArrayBuffer 中转 | 潜在 | 当前生产几乎不触发 writeBuffer |
| `setFallbackContext` | 接口缺口 | `(as any)` 每帧注入；降级 fillRect 很慢 |
| `buildJoinedPolylineGeometry` | legacy surface 热点 | 厚线无 geometry cache |

### 3.3 Renderer 闲置

- 全仓库生产路径：`drawInstances` / `writeBuffer` **仅** 出现在 `createWebGLRenderer` + 测试。
- candle / volume / 多数 indicator 直接：`context.candleWebGLSurface.drawRectBuffer` / `lineWebGLSurface.drawLineStrips`。

---

## 4. 目标架构

```
UI / Public API
      │ actions / useRenderer
      ▼
 StateKernel ──────────────────► readonly signals
      │                                │
      │ reconcile                      │ read
      ▼                                ▼
 IndicatorManager / SubPaneManager    MarkerManager / DrawingStore
      │ add|remove|visibility Layer         │ 帧 runtime 投影
      ▼                                     ▼
 Scene.layers  ── paintPane ──►  Layer.paint(PaintContext)
                                        │
                                        ▼
                                 Renderer (WebGL → 将来 WebGPU)
                                        │
 ChartRenderer：唯一帧循环入口
   prepareFrame → clear canvases → build context → scene.paintPane → axes / composite
```

**删除：** 每帧 `rendererPluginManager.render(...)` 作为主绘制入口。

---

## 5. Manager / 组件职责边界（契约）

### 5.1 总原则

| 层 | 做 | 不做 |
|----|----|------|
| **StateKernel** | 业务状态 SSOT；actions 写入；readonly 读 | DOM、WebGL、帧缓存 |
| **Managers** | 读 kernel → 投影到 runtime / Layer 生命周期 | 影子业务数组 / Map 当 SSOT |
| **ChartRenderer** | 帧编排、context 组装、清屏、调 Scene | 业务状态 |
| **Scene** | Layer 注册、z-order、`paintPane` | 知道具体 GL 实现 |
| **Layer** | `paint` 发绘制命令；可有私有 buffer 缓存 | 写 kernel；跨帧业务状态 |
| **Renderer** | buffer/pipeline/draw* / fallback | 图表业务语义 |

### 5.2 各组件目标职责

| 组件 | 目标职责 | 明确不负责 |
|------|----------|------------|
| **ChartDataManager** | 数据源、缓冲、增量加载、对比序列；对齐 kernel data | 绘制调度 |
| **ChartViewportManager** | 尺寸/DPR/scroll 与 DOM；对齐 kernel viewport | 指标 / settings |
| **ChartIndicatorManager** | 读 `indicatorState` → 主图 Layer 挂卸 + scheduler 配置 | 自持 active 列表 |
| **SubPaneManager** | 读 `subPaneState` → pane DOM + Layer reconcile | 自持 subPane SSOT |
| **MarkerManager** | 帧 runtime：positions / ephemeral / hover / hit-test；读 `customMarkers$` | customMarkers 实体存储 |
| **DrawingStore** | 读 kernel drawings / selection；供 drawing Layer 与交互 | 本地 drawings 数组 SSOT |
| **ChartZoomController** | 纯计算（clamp / computeKWidthKGap） | 持有 zoom plain field |
| **ChartRenderer** | 单路径帧循环 + context 工厂 | 双 dispatch |
| **Scene / Layer** | 组合与 paint | 业务 SSOT |
| **RendererPluginManager** | **变形或删除**（见 Phase 0） | 每帧主绘制循环 |

### 5.3 跨帧 vs 帧内

| 跨帧（kernel） | 帧内 / 瞬时（Manager / Renderer plain OK） |
|----------------|--------------------------------------------|
| markers 实体、drawings、selection、settings、mode、indicators、pane ratios、zoom | marker positions、hover、dragStart、RAF pending、本帧 kLinePositions 缓存 |

---

## 6. 分阶段实施

### Phase 0 — 单路径调度（P0，必做）

**目标：** 消灭双 dispatch；内置与外部插件统一经 Scene 绘制。

**方案（推荐 A）：**

1. `Chart.useRenderer(plugin)`：
   - 注册元数据（name / config / enabled）
   - `createLayerFromPlugin(plugin, getCtx, paneId)` → `scene.addLayer`
   - **不再**依赖 `RendererPluginManager.render` 画任何东西
2. `setRendererEnabled` / `removeRenderer` 只驱动 Layer visibility / remove + 元数据
3. `renderPanes` 删除 `rendererPluginManager.render` 调用
4. 去掉 drawing / indicator 上的 `setEnabled(false)` 双注册套路（只加 Layer）
5. `RendererPluginManager` 二选一：
   - **A1（推荐）：** 降为「插件注册表 + enabled 元数据」，删除 `render()` / `getRenderers` 绘制语义
   - **A2：** 直接删除，逻辑并入 ChartRenderer / 薄 `PluginLayerRegistry`

**验收：**

- [ ] `renderPanes` 内无 `rendererPluginManager.render`
- [ ] 内置插件无 `setEnabled(false)` 仅为了防双画
- [ ] 外部 `useRenderer` 插件在 Scene 路径可见
- [ ] `pnpm -r test` 相关 suite 全绿
- [ ] 手动：主图 / 副图 / drawing / crosshair / 外部 mock 插件无回归

**风险：**

- system 渲染器（timeAxis 等）当前走 `renderPlugin` / 独立 Layer —— 需统一清单，避免漏挂
- UpdateLevel Main/Overlay 过滤现由 Manager 做；Scene 需等价策略（role 过滤已部分存在）

---

### Phase 1 — Renderer API 落地（P1）

**目标：** 至少一条生产绘制路径经 `PaintContext.renderer`，证明后端可替换。

**范围（建议顺序）：**

1. **Candle Layer 真用 Renderer**
   - `drawInstances` 画 body/wick（或等价 batch）
   - 不再在 candle 路径读 `context.candleWebGLSurface`（可暂留 fallback 分支）
2. **Line 类指标抽公共 helper**
   - `drawLines` / fill band 走 Renderer
3. **RenderContext 瘦身计划**
   - 标记 `candleWebGLSurface` / `lineWebGLSurface` 为 deprecated
   - 新代码禁止新增 surface 直调

**可选同步：**

- `writeBuffer` 直写 `WebGLBuffer`，去掉 JS `ArrayBuffer` 中转（仅当 Phase 1 真走 writeBuffer 时有收益）
- `setFallbackContext` 升为 `Renderer` 正式可选 API 或内建 Canvas2D backend

**验收：**

- [ ] candle 生产路径调用 `renderer.drawInstances`（或文档化的等价 Renderer API）
- [ ] WebGL 不可用时 fallback 仍正确（测试：`webglRenderer.fallback.test.ts` 扩展）
- [ ] 无视觉回归（对比截图或关键 e2e 可选）

---

### Phase 2 — 清理与性能（P2）

1. 删除 / 收口 `createLayerFromPlugin` 中「永远忽略 `ctx.renderer`」的旧插件（已迁完的 Layer 改为 native Layer）
2. 移除 `RenderContext` 上 WebGL surface 字段（或仅内部测试保留）
3. `buildJoinedPolylineGeometry` geometry cache（legacy 或 Renderer 路径均可）
4. 文档：更新 `docs/rendering-engine-architecture.md` 与 `docs/architecture.md`，标明单路径 + 职责边界
5. 删除死代码：`RendererPluginManager.render` 若已无调用、双写 visibility 辅助等

**验收：**

- [ ] `git grep candleWebGLSurface packages/core/src/engine/renderers` → 零（或仅 fallback 白名单）
- [ ] 无 `setFallbackContext` 的 `(as any)` 调用
- [ ] 架构文档与代码一致

---

### Phase 3 — WebGPU 预备（P3，可选 / 后续 PR）

- 实现 `createWebGPURenderer` 满足 `Renderer` 契约
- feature detect + 运行时切换
- compute 路径留给 volume profile / footprint 等

**本 PRD 不要求交付 WebGPU 实现。**

---

## 7. 外部 API 兼容

| API | 行为保持 | 内部变化 |
|-----|----------|----------|
| `chart.useRenderer(plugin, config?)` | 插件参与绘制 | 进 Scene Layer，不进 Manager.render |
| `chart.removeRenderer(name)` | 移除 | `scene.removeLayer` + 注销元数据 |
| `chart.setRendererEnabled(name, bool)` | 显隐 | Layer.visible（+ 元数据） |
| `chart.getRenderer(name)` | 取插件实例 | 注册表查询 |
| `chart.updateRendererConfig` | 改配置并重绘 | 不变语义 |
| RendererPlugin 形状（`draw(RenderContext)`） | Phase 0 仍支持 | Phase 1+ 鼓励 native Layer |

Breaking 仅在：**依赖「插件只注册到 Manager、且自己调用 render」的非常规用法** —— 仓库内无此用法则无需 major；若有公开文档写 Manager 内部细节需同步。

---

## 8. 测试策略

| 层级 | 内容 |
|------|------|
| 单元 | Scene paint 顺序；useRenderer → Layer 存在；setEnabled → visible；无 Manager.render 调用（spy） |
| 回归 | 现有 `layerFromPlugin` / `webglRenderer` / indicator / subPane / drawing 测试 |
| 集成（可选） | 一帧内启用插件列表快照；UpdateLevel Overlay 只 paint overlay roles |
| 手动 | 主图缩放滚动、副图增删、画线、十字线、主题切换、WebGL 关闭降级 |

命令：

```bash
pnpm -r test
pnpm type-check
```

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| system 渲染器漏挂导致轴/时间轴空白 | Phase 0 前列出全部 system / global 插件清单与挂载点 |
| UpdateLevel 语义漂移 | Scene 侧用 `roles` + Layer.role/overlay 对齐现有 Main/Overlay 过滤 |
| 外部插件依赖 RenderContext 全字段 | Phase 0 继续注入完整 RenderContext；Phase 1 再瘦 |
| 性能回退 | Phase 0 前后用 Performance 面板对比一帧；预期持平或略好（少一次空循环） |
| 双写 visibility 历史调用残留 | 统一 helper：`setPluginVisible(name, v)` 单入口 |

---

## 10. 成功标准（Definition of Done）

**Phase 0 Done：**

- 单路径调度；双路径结构消除
- 外部插件走 Scene
- 测试全绿

**Phase 1 Done：**

- 至少 candle 生产路径经 Renderer API
- fallback 覆盖

**Phase 2 Done：**

- surface 直调清理；文档更新；无 `(as any).setFallbackContext`

**整体：**

- 兼容层（双路径 + 双注册 + surface 旁路）可声明拆除
- Manager 职责与本文 §5 一致
- 具备接入 WebGPU backend 的管线形状

---

## 11. 建议实施顺序与估算

| 阶段 | 内容 | 粗估 |
|------|------|------|
| Phase 0 | 单路径 + useRenderer 桥 + 删 Manager.render | 1–2 PR |
| Phase 1 | Candle（+ 可选 line）迁 Renderer | 1–2 PR |
| Phase 2 | 清理 / cache / 文档 | 1 PR |
| Phase 3 | WebGPU | 独立 epic |

**推荐立即开工：Phase 0。** 收益最大、风险可控、不依赖 WebGPU。

---

## 12. 文档与跟踪

- 本 PRD：`.opencode/plans/2026-07-15-render-compat-layer-PRD.md`
- 后续可拆：
  - Spec：`docs/superpowers/specs/2026-07-15-render-single-path-design.md`
  - Plan：`docs/superpowers/plans/2026-07-15-render-single-path.md`
- 完成后回写 `docs/rendering-engine-architecture.md`

### 状态勾选

- [x] Phase 0 — 单路径调度（2026-07-15：删 `renderPanes` 内 Manager.render；`useRenderer` 挂 Scene；去掉 drawing/指标/副图 `setEnabled(false)` 双注册；`setRendererEnabled` 驱动 Layer 显隐；审查修复：paint 隔离 / onUninstall 单点 / useRenderer 幂等）
- [x] Phase 1 — candle 经 sceneRenderer.drawInstances（2026-07-15：注入 sceneRenderer；drawCandlesViaRenderer；legacy surface 兜底；beginFrame clear；fail-closed）
- [x] Phase 1.1 样板 — MA 经 drawLinesViaRenderer（2026-07-15：drawLines boolean fail-closed；linesViaRenderer helper；MA 优先 sceneRenderer）
- [x] Phase 1.1 批量 — 纯折线指标 `tryDrawLinesGpu`（dema/tema/hma/…/rsi/macd-lines/ichimoku 等；BOLL/ENE 含 fill band 仍 legacy）
- [ ] Phase 2 — 清理与文档
- [ ] Phase 3 — WebGPU（可选）

---

## 13. 与 StateKernel PRD 的关系

| 主题 | 归属 |
|------|------|
| 业务状态 SSOT、影子 Map/数组 | StateKernel PRD（已基本完成） |
| 绘制调度双路径、Renderer 闲置、Manager 绘制职责 | **本 PRD** |
| npm scope 数字开头构建问题 | StateKernel PRD 附录（独立决策，非本 PRD） |

两线正交：SSOT 不阻塞本 PRD；本 PRD 不回退 SSOT。

(End of PRD)
