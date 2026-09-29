# 退役 RendererPlugin 契约，渲染器统一为原生 Layer

## 背景

`rendering/scene/createLayerFromPlugin.ts` 自认是兼容层（文件头：「将**旧式** RendererPlugin 适配为由
Scene 调度的 Layer」，`:29` 有 `@Todo 兼容层`）。它把业务 `RenderContext` 注入旧式
`RendererPlugin.draw`，再包装成 `Layer.paint`。当前**全部内置渲染器**都经这条路进入 Scene。

本设计的目标：**淘汰 `RendererPlugin` / `RendererPluginWithHost` 契约及围绕它建立的
plugin 机制（`RendererPluginManager`、渲染器对 `PluginHost` 的使用），让渲染器统一以原生
`Layer` 形态存在。** 注意：接缝本身（把 `RenderContext` 注入 Layer 的公共 adapter）必须保留，
否则 106 个渲染器要各自复制 `paint` 样板，违反单一事实来源。

## 现状事实（Blast Radius，2026-09 统计）

| 指标 | 数量 |
| --- | --- |
| `RenderContext` 引用文件 | 125 |
| `engine/renderers/**` 中引用 `RendererPlugin` 的文件 | 106 |
| 使用 `onInstall` + `getDeclaredNamespaces` 的渲染器 | ~58 |
| `createLayerFromPlugin` 调用点 | 15 |
| `useRenderer/getRenderer/removeRenderer` 调用点 | 8 |

驱动来源：`chartRenderer.initCoreRenderers`（核心层）、`subPaneManager`（子图 scale/title）、
`chartIndicatorManager`（子图指标实例）、`chart.ts`（useRenderer/removeRenderer/getRenderer）。

## 目标契约：单一 Layer 契约

结论：**不在旧契约之上再造一个 adapter，而是把两条契约合成一条。** `RendererPlugin` 与其
`draw` 语义彻底删除，`Layer` 成为唯一绘制契约。

### 1. Layer 是唯一绘制契约

`Layer.paint` 直接接收本帧渲染上下文——由 `RenderContext` 的 7 个子契约（`render-context-role-split.md`）
组合，外加场景字段 `paneId / region / frameNumber / deltaMs`。渲染器按需声明子契约（收窄依赖），
不再有 `draw(context)` 与 `paint(paintContext)` 两套签名。

### 2. 横切关注点上移到 Scene

`role / paneRole / visible` 过滤、`z` 排序、**逐层 `try/catch` 异常隔离**由 Scene 统一承担。
这些本就是 Scene 的职责（`createScene` 已做 role/visible/pane 过滤），
`createLayerFromPlugin.paint` 里的重复检查与异常包裹随之删除。

### 3. 分层：Scene 对上下文泛型化

`rendering/scene/` 保持与业务无关：`Layer<TCtx>` / `Scene<TCtx>` 只透传 `TCtx`，图表侧实例化为
`Scene<RenderFrameContext>`。禁止让 scene 反向依赖 `foundation/plugin` 的业务类型。

### 4. 渲染器 = Layer 工厂

```ts
// before
createMARendererPlugin(options): RendererPluginWithHost
// after
createMARenderLayer(options, deps): Layer
```

### 5. config/state 不进渲染器（SSOT）

删除渲染器对 `setConfig` / `getConfig` 的状态持有；渲染器通过构造期注入的 reader
（`indicatorStateReader`、StateKernel 投影）读取状态。`updateRendererConfig` 语义由显式 state
action + redraw 取代。

## 能力映射（关键：不能丢的能力）

| RendererPlugin 能力 | 去向 |
| --- | --- |
| `name` | `Layer.id`（沿用 `plugin:<name>` 规则，保证现有 id 引用不破） |
| `paneId` | `Layer.paneRole` |
| `priority` | `Layer.z` |
| `layer` / `priority` | `Layer.role`（`pluginPriorityToRole` 变为原生 role 解析） |
| `enabled` | `Layer.visible` |
| 可见性 / paneRole 过滤 / 异常隔离 | 上移到 Scene（不再逐层实现） |
| `onResize` | 由框架转发给 Layer |
| `onUninstall` | `Layer.dispose` |
| `onInstall(host)` + `getDeclaredNamespaces()` | **替换为显式依赖注入**：`IndicatorRenderStateReader` 等经 factory 参数传入，删除渲染器对 `PluginHost` 的依赖 |
| `getConfig` / `setConfig` | **删除**：渲染器不再持有 config，状态经注入 reader 读取；`updateRendererConfig` 由显式 state action + redraw 取代 |
| `isSystem` | 由 `role` 表达，删除该标记 |

> ⚠️ `onInstall` + 状态命名空间是 ~58 个指标渲染器的唯一状态来源，是**最易回归点**，必须逐批
> 用现有 renderer 测试守住。

## 删除清单（收尾阶段）

- `rendering/scene/createLayerFromPlugin.ts`（整文件删除，横切逻辑并入 Scene）
- `foundation/plugin/types.ts` 中的 `RendererPlugin` / `RendererPluginWithHost`
- `foundation/plugin/impl/rendererPluginManager.ts`
- 渲染器对 `PluginHost` 的使用（`onInstall` / `registerStateOwner` / `clearByOwner`）
- 渲染器内的 `setConfig` / `getConfig` / `onResize` 状态持有
- `Chart.useRenderer / removeRenderer / getRenderer / updateRendererConfig / getAllRenderers`
  的 plugin 语义，改为 Layer 语义
- `rendering/scene/types.ts` 的旧 `PaintContext`（由泛型 `TCtx` 取代）
- 相关测试与文档（`rendering/README.md` 的桥接段）

## 公开 API 影响（breaking）

`RendererPlugin` 目前经 `core/plugin` 子路径公开（`package.json` exports → `foundation/plugin/index.ts`）。
删除属 breaking change：需 semver major，或保留 `@deprecated` 类型转发一个版本，另行决策。

## 分阶段计划（每阶段一个 < 5000 行 PR）

- **Stage 0（前期，主代理）✅ 已完成**：本文档 + `Scene`/`Layer` 泛型化 + `Layer.paint` 改为接收帧上下文 +
  横切关注点上移 Scene + 一条纵切（`gridLines`）迁移 + 测试。
  门禁：`type-check` + 各包测试。
- **Stage 1..N（子代理，≤ 3 并行）**：按类别分批迁移渲染器——
  主图基础层 / 子图指标层（~58 个，含状态注入）/ 分时 / markers。
  每批门禁：`type-check` + 该批 renderer 测试；每批一个 PR。
- **Stage N+1（收尾，主代理）**：删 `RendererPlugin` 类型、`RendererPluginManager`、
  渲染器对 `PluginHost` 的 `onInstall`/`getDeclaredNamespaces` 依赖、`wrapRendererAsLayer` 桥接；
  更新导出、README、测试。

## Stage 0 落地结果（2026-09）

已完成并全绿：

- `rendering/scene/types.ts`：`Layer<TFrame>` / `Scene<TFrame>` 泛型化；`Layer.pane`（具体 paneId 或
  `LAYER_PANE_GLOBAL`）取代 `paneRole`；`SceneFrame` + `LayerPaint<TFrame>`；`Scene.paint(frame)` 一次
  画完所有 pane。
- `rendering/scene/createScene.ts`：横切关注点上移——pane 匹配、可见性、role 过滤、z 排序、
  **逐 Layer try/catch 异常隔离**。
- `foundation/plugin/types.ts`：新增泛型 `DrawContext<TFrame, TSceneRenderer>` + `FrameDrawContext`；
  `LayerDrawContext`（`impl/layerDrawContext.ts`）把 `TFrame` 实例化为 `RenderContext`。
- `engine/render/chartRenderer.ts`：累加 `framePanes` 后一次 `scene.paint`；`gridLines` 直连原生 Layer。
- 迁移期桥接：`engine/render/layers/wrapRendererAsLayer.ts`（旧 RendererPlugin → Layer，供子代理逐批排空）
  与 `engine/renderers/Indicator/factory.ts`（`createIndicatorLayer`）。
- `engine/chart.ts`：渲染器 API 改 Layer 语义（`useRenderer(layer)` / `getRenderer` / `removeRenderer` /
  `setRendererEnabled`），删除 `RendererPluginManager` 字段与 `updateRendererConfig`。
- 门禁：`pnpm type-check` 通过；core 247 文件 / 2641 用例、vue 168、react 2、angular 12、
  agent-runtime 97、desktop-electron 19 全绿。

## 风险与测试

- 视觉回归：Scene role/z 变化会影响叠放顺序，必须人工截图比对（子图上/主图 overlay 是重点）。
- 指标状态：`onInstall` 命名空间迁移期是回归高发区，逐批守住现有 `__tests__/*.renderer.test.ts`。
- 禁止 add-then-remove 的过渡兼容逻辑（AGENTS 明文），因此每类渲染器必须直接替换成型。
