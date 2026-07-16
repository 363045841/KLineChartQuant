# Phase 1: Candle via Renderer API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让主图蜡烛生产路径经 `PaintContext.renderer.drawInstances` 绘制，证明后端可替换；不再依赖 `RenderContext.candleWebGLSurface` 旁路。

**Architecture:** Phase 0 已单路径 Scene 调度。Phase 1 把 candle 从「plugin.draw → candleWebGLSurface.drawRectBuffer」改为「Layer.paint → renderer.writeBuffer/drawInstances → surface.compositeTo」。几何准备（`prepareCandles`）保持不变；仅换出口。Canvas2D 与 WebGL 不可用时仍走现有 2D 回退。

**Tech Stack:** TypeScript、vitest、WebGL2（`createWebGLRenderer` / `CandleWebGLSurface`）、Scene Layer。

**PRD:** `.opencode/plans/2026-07-15-render-compat-layer-PRD.md` §Phase 1  
**前置:** Phase 0 已完成（`renderPanes` 无 `Manager.render`；`useRenderer` 挂 Scene）

---

## File map

| File | Role |
|------|------|
| `packages/core/src/rendering/render/Renderer.ts` | 可选：正式暴露 composite / setFallbackContext（若需） |
| `packages/core/src/rendering/render/createWebGLRenderer.ts` | 确保 drawInstances + composite 契约稳定 |
| `packages/core/src/rendering/scene/createLayerFromPlugin.ts` | 将 `PaintContext.renderer` 注入 draw（最小改动） |
| `packages/core/src/foundation/plugin/types.ts` | `RenderContext` 增加可选 `sceneRenderer?: Renderer` **或** 扩展 draw 签名 |
| `packages/core/src/engine/renderers/candle.ts` | 生产 candle 改走 Renderer API |
| `packages/core/src/engine/render/layers/candleLayer.ts` | 保持工厂；依赖上述注入 |
| `packages/core/src/engine/render/chartRenderer.ts` | beginFrame 后确保 fallback/composite 目标正确 |
| `packages/core/src/engine/renderers/candle.ts` 旁测 / 新测 | 单测 drawInstances 被调用 |
| `packages/core/src/rendering/render/__tests__/webglRenderer*.ts` | 已有；扩展 composite 断言 |

**Out of scope this plan:** 全量 line 指标迁移、删掉所有 `*WebGLSurface` 字段、WebGPU 实现、buffer 去 ArrayBuffer 中转（可作 Task 后续 optional）。

---

## Design decisions (lock before coding)

### D1 — 如何把 Renderer 交给 candle

**选用方案 B（推荐，改动面小）：**

在 `createLayerFromPlugin.paint` 里：

```ts
const context = getContext()
if (!context) return
// 注入本帧 Scene 的 Renderer，供已迁路径使用
;(context as RenderContext & { sceneRenderer?: Renderer }).sceneRenderer = ctx.renderer
plugin.draw(context)
```

Candle 内：

```ts
const r = context.sceneRenderer
if (r) drawCandlesViaRenderer(r, ...)
else /* 旧 surface 或 2D */
```

**不选 A（改 RendererPlugin.draw 签名）** — 波及全部插件。  
**不选 C（完全 native candle Layer 重写）** — 可作后续清理，本 plan 不强制。

### D2 — 画到哪块 surface

`chartRenderer` 的 `sceneRenderer = createWebGLRenderer(sharedSurface, sharedSurface)` 内部已有 **自己的** `CandleWebGLSurface`。  
`drawInstances` 已委托 `candleSurface.drawRectBuffer`。

Composite：candle 成功 drawInstances 后调用：

```ts
context.sceneRenderer.surface.compositeTo(context.ctx, context 对应 region, { imageSmoothingEnabled: false })
```

注意：`beginFrame(region)` 已在 `paintPane` 前调用，region 与 pane 对齐。  
**不要**再用 `context.candleWebGLSurface`（pane 级另一套 surface）画 candle，避免双 surface。

### D3 — 回退顺序

```
enableWebGLRendering === false  → Canvas2D
sceneRenderer 缺失 / caps 不可用 → Canvas2D  
drawInstances 失败（无 pipeline）→ Canvas2D
成功 → compositeTo main ctx
```

### D4 — setFallbackContext

现每帧 `(sceneRenderer as any).setFallbackContext(overlayCtx)`。  
Candle 失败时应画在 **mainCtx**，不是 overlay。  
Phase 1：candle 成功路径不依赖 fallback；失败走 `drawCandlesWithCanvas2D(mainCtx)`。  
`setFallbackContext` 正规化可放 Task 6 optional。

---

### Task 1: 抽 `drawCandlesViaRenderer` 纯函数 + 失败测试

**Files:**
- Create: `packages/core/src/engine/renderers/candleViaRenderer.ts`
- Create: `packages/core/src/engine/renderers/__tests__/candleViaRenderer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/src/engine/renderers/__tests__/candleViaRenderer.test.ts
import { describe, it, expect, vi } from 'vitest'
import { drawCandlesViaRenderer } from '../candleViaRenderer'
import type { Renderer } from '../../../rendering/render/Renderer'

function mockRenderer(): Renderer & {
  writeBuffer: ReturnType<typeof vi.fn>
  drawInstances: ReturnType<typeof vi.fn>
  createBuffer: ReturnType<typeof vi.fn>
  createPipeline: ReturnType<typeof vi.fn>
} {
  const buffers = new Map<object, ArrayBuffer>()
  const pipelines = new Map<object, { type: string }>()
  return {
    surface: {
      isAvailable: () => true,
      resize: () => {},
      bindRegion: () => true,
      clearRegion: () => {},
      compositeTo: vi.fn(),
      dispose: () => {},
    },
    caps: { compute: false, storageBuffer: false, maxInstances: 1e6, name: 'webgl2' },
    createBuffer: vi.fn((usage, size) => {
      const h = {}
      buffers.set(h, new ArrayBuffer(size))
      return h as never
    }),
    writeBuffer: vi.fn((handle, data: ArrayBufferView) => {
      /* store optional */
    }),
    destroyBuffer: vi.fn(),
    createPipeline: vi.fn((desc: { type: string }) => {
      const h = {}
      pipelines.set(h, desc)
      return h as never
    }),
    destroyPipeline: vi.fn(),
    createComputePipeline: () => {
      throw new Error('no')
    },
    destroyComputePipeline: () => {},
    beginFrame: vi.fn(),
    drawInstances: vi.fn(),
    drawLines: vi.fn(),
    dispatchCompute: () => {},
    endFrame: vi.fn(),
    dispose: vi.fn(),
  } as never
}

describe('drawCandlesViaRenderer', () => {
  it('issues 4 drawInstances for non-empty up/down body and wick', () => {
    const r = mockRenderer()
    const prepared = {
      upBodyCount: 1,
      downBodyCount: 1,
      upWickCount: 1,
      downWickCount: 1,
      upBodyBuf: new Float32Array([0, 0, 10, 20]),
      downBodyBuf: new Float32Array([20, 0, 10, 20]),
      upWickBuf: new Float32Array([5, 0, 1, 30]),
      downWickBuf: new Float32Array([25, 0, 1, 30]),
    }
    const ok = drawCandlesViaRenderer(r, prepared as never, '#0f0', '#f00', 0)
    expect(ok).toBe(true)
    expect(r.drawInstances).toHaveBeenCalledTimes(4)
  })

  it('returns false when instanceCount all zero without calling draw', () => {
    const r = mockRenderer()
    const prepared = {
      upBodyCount: 0,
      downBodyCount: 0,
      upWickCount: 0,
      downWickCount: 0,
      upBodyBuf: new Float32Array(0),
      downBodyBuf: new Float32Array(0),
      upWickBuf: new Float32Array(0),
      downWickBuf: new Float32Array(0),
    }
    const ok = drawCandlesViaRenderer(r, prepared as never, '#0f0', '#f00', 0)
    expect(ok).toBe(true) // nothing to draw is success
    expect(r.drawInstances).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/renderers/__tests__/candleViaRenderer.test.ts
```

Expected: cannot find module / drawCandlesViaRenderer not defined

- [ ] **Step 3: Minimal implementation**

```ts
// packages/core/src/engine/renderers/candleViaRenderer.ts
import type { Renderer, BufferHandle, PipelineHandle } from '../../rendering/render/Renderer'

export type CandleRectBatch = {
  upBodyCount: number
  downBodyCount: number
  upWickCount: number
  downWickCount: number
  upBodyBuf: Float32Array
  downBodyBuf: Float32Array
  upWickBuf: Float32Array
  downWickBuf: Float32Array
}

/** 经 Renderer.drawInstances 画 body/wick；不负责 composite */
export function drawCandlesViaRenderer(
  renderer: Renderer,
  prepared: CandleRectBatch,
  upColor: string,
  downColor: string,
  scrollLeft: number,
): boolean {
  try {
    const pipeline = renderer.createPipeline({ type: 'candle' }) as PipelineHandle
    const unit = renderer.createBuffer('vertex', 64)

    const drawBatch = (buf: Float32Array, count: number, color: string) => {
      if (count <= 0) return
      const instances = renderer.createBuffer('instance', count * 4 * 4)
      renderer.writeBuffer(instances, buf.subarray(0, count * 4))
      renderer.drawInstances({
        pipeline,
        vertices: unit,
        instances,
        instanceCount: count,
        vertexCount: 6,
        uniforms: { color, scrollLeft },
      })
      renderer.destroyBuffer(instances)
    }

    drawBatch(prepared.upBodyBuf, prepared.upBodyCount, upColor)
    drawBatch(prepared.downBodyBuf, prepared.downBodyCount, downColor)
    drawBatch(prepared.upWickBuf, prepared.upWickCount, upColor)
    drawBatch(prepared.downWickBuf, prepared.downWickCount, downColor)

    renderer.destroyBuffer(unit)
    renderer.destroyPipeline(pipeline)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/renderers/__tests__/candleViaRenderer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/renderers/candleViaRenderer.ts packages/core/src/engine/renderers/__tests__/candleViaRenderer.test.ts
git commit -m "feat(core): add drawCandlesViaRenderer helper for Renderer API"
```

---

### Task 2: 注入 `sceneRenderer` 到 RenderContext

**Files:**
- Modify: `packages/core/src/foundation/plugin/types.ts` (`RenderContext`)
- Modify: `packages/core/src/rendering/scene/createLayerFromPlugin.ts`
- Modify: `packages/core/src/rendering/scene/__tests__/layerFromPlugin.test.ts`

- [ ] **Step 1: Extend RenderContext type**

In `types.ts` `RenderContext` 增加：

```ts
/** Phase 1: Scene 本帧 Renderer；candle 等迁出 surface 旁路时使用 */
sceneRenderer?: import('../../rendering/render/Renderer').Renderer
```

- [ ] **Step 2: Inject in createLayerFromPlugin**

```ts
paint(ctx: PaintContext) {
  if (!visible) return
  if (paneRole === 'sub' && ctx.paneId !== targetPaneId) return
  const context = getContext()
  if (!context) return
  context.sceneRenderer = ctx.renderer
  try {
    plugin.draw(context)
  } catch (e) {
    console.error(`[RendererPlugin] ${plugin.name} draw error:`, e)
  }
}
```

- [ ] **Step 3: Test injection**

```ts
it('assigns PaintContext.renderer to RenderContext.sceneRenderer before draw', () => {
  const plugin = makeMockPlugin({
    draw: vi.fn((c: RenderContext) => {
      expect(c.sceneRenderer).toBe(stubPaintCtx.renderer)
    }),
  })
  const context = makeMockContext()
  const layer = createLayerFromPlugin(plugin, () => context, 'main')
  layer.paint(stubPaintCtx)
  expect(plugin.draw).toHaveBeenCalledOnce()
})
```

- [ ] **Step 4: Run**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/scene/__tests__/layerFromPlugin.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/foundation/plugin/types.ts packages/core/src/rendering/scene/createLayerFromPlugin.ts packages/core/src/rendering/scene/__tests__/layerFromPlugin.test.ts
git commit -m "feat(core): inject sceneRenderer into RenderContext for layers"
```

---

### Task 3: Candle 生产路径改走 Renderer API

**Files:**
- Modify: `packages/core/src/engine/renderers/candle.ts` (`draw` + `drawCandlesWithWebGL` 替换/旁路)
- Keep: `prepareCandles`、`drawCandlesWithCanvas2D`、`drawVolumePriceMarkers` 不变

- [ ] **Step 1: Rewrite draw branch**

Replace `draw` 内 WebGL 分支逻辑为：

```ts
draw(context: RenderContext) {
  // ... existing prepare ...
  const prepared = prepareCandles(...)
  const up = colors.candleUpBody
  const down = colors.candleDownBody

  let usedGpu = false
  if (context.settings?.enableWebGLRendering !== false && context.sceneRenderer) {
    usedGpu = drawCandlesViaRenderer(
      context.sceneRenderer,
      prepared,
      up,
      down,
      context.scrollLeft,
    )
    if (usedGpu) {
      context.sceneRenderer.surface.compositeTo(context.ctx, {
        // region: beginFrame 已 bind；SurfaceBackend.compositeTo 用当前 region
        // 若 API 需要 region，从 context.viewport + pane 构造
      } as never)
      // 实际签名见 SurfaceBackend.compositeTo(targetCtx, region, options)
      // 必须传入与 beginFrame 相同的 region；若 sceneRenderer 内部持有 lastRegion，可扩展 getLastRegion
    }
  }
  if (!usedGpu) {
    // 过渡：仍可尝试旧 candleWebGLSurface（一帧双保险 optional）
    // Phase 1 完成标准：优先 sceneRenderer；旧 surface 仅 fallback
    const legacy = drawCandlesWithWebGL(context, prepared, up, down)
    if (!legacy) {
      drawCandlesWithCanvas2D(ctx, scrollLeft, prepared, up, down)
    } else {
      compositeWebGLToMainCanvas(ctx, context)
    }
  }

  drawVolumePriceMarkers(...)
}
```

**重要：** 查 `SurfaceBackend.compositeTo` 签名（`createWebGLSurfaceBackend`）——需要 `region`。  
若 `sceneRenderer` 未暴露 lastRegion，二选一：

1. 在 `createWebGLRenderer` 存 `lastRegion`，增加 `getLastRegion(): SurfaceRegion | null`（非公开也可 cast）
2. 或 candle 从 `context.viewport` + `pane` 重建 region：`{ x:0, y: pane.top, width: plotWidth, height: pane.height, dpr }`

推荐 **方案 2**（不扩接口）：与 `chartRenderer.renderPanes` 构造 region 一致。

```ts
const region = {
  x: 0,
  y: context.pane.top,
  width: context.viewport?.plotWidth ?? context.paneWidth,
  height: context.pane.height,
  dpr: context.dpr,
}
context.sceneRenderer.surface.compositeTo(context.ctx, region, {
  imageSmoothingEnabled: false,
})
```

- [ ] **Step 2: Unit test candle prefers sceneRenderer**

```ts
// packages/core/src/engine/renderers/__tests__/candle.sceneRenderer.test.ts
it('uses sceneRenderer.drawInstances when present', () => {
  const drawInstances = vi.fn()
  // build minimal RenderContext with sceneRenderer mock + data
  // call createCandleRenderer().draw(context)
  // expect drawInstances called; candleWebGLSurface.drawRectBuffer not called
})
```

- [ ] **Step 3: Run**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/renderers/__tests__/candle
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine/renderers/candle.ts packages/core/src/engine/renderers/__tests__/candle.sceneRenderer.test.ts packages/core/src/engine/renderers/candleViaRenderer.ts
git commit -m "feat(core): draw candles via PaintContext sceneRenderer"
```

---

### Task 4: 修正 composite / region 与手动验收脚本

**Files:**
- Modify: `packages/core/src/engine/renderers/candle.ts`（若 Task 3 composite 有误）
- Modify: `packages/core/src/rendering/render/createWebGLRenderer.ts`（仅当 composite 需要 lastRegion）

- [ ] **Step 1: Verify SurfaceBackend.compositeTo signature**

Read `packages/core/src/rendering/render/SurfaceBackend.ts` and `createWebGLSurfaceBackend.ts`. Wire exact args.

- [ ] **Step 2: Manual checklist (dev server)**

```
pnpm dev
```

1. 主图蜡烛可见、涨跌色正确  
2. 缩放滚动无花屏  
3. 分时切 K 线蜡烛显隐正常  
4. 关闭 WebGL 设置（若有）→ 2D 蜡烛仍在  
5. 控制台无 draw 风暴错误  

- [ ] **Step 3: Run broader suite**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine src/rendering
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git commit -am "fix(core): correct candle composite region for sceneRenderer"
```

---

### Task 5: 废弃 candle 对 pane surface 的依赖（软）

**Files:**
- Modify: `packages/core/src/engine/renderers/candle.ts`
- Modify: `packages/core/src/foundation/plugin/types.ts`（JSDoc deprecated on `candleWebGLSurface`）

- [ ] **Step 1: Prefer-only sceneRenderer**

当 `context.sceneRenderer` 存在时，**不要**再调用 `drawCandlesWithWebGL`（旧 surface）。  
仅 `sceneRenderer` 缺失时才 legacy。

```ts
if (context.sceneRenderer && settings webgl on) {
  usedGpu = drawCandlesViaRenderer(...)
  if (usedGpu) composite...
} else if (/* legacy */) {
  drawCandlesWithWebGL(...)
} else {
  drawCandlesWithCanvas2D(...)
}
```

- [ ] **Step 2: JSDoc**

```ts
/** @deprecated Phase 1+: prefer context.sceneRenderer; remove after all rect drawers migrate */
candleWebGLSurface?: CandleWebGLSurface
```

- [ ] **Step 3: Commit**

```bash
git commit -am "chore(core): deprecate candleWebGLSurface for candle path"
```

---

### Task 6 (optional): `setFallbackContext` 正规化

**Files:**
- Modify: `packages/core/src/rendering/render/Renderer.ts`
- Modify: `packages/core/src/rendering/render/createWebGLRenderer.ts`
- Modify: `packages/core/src/engine/render/chartRenderer.ts`（去掉 `as any`）

Only if Task 3–5 green and time remains.

```ts
// Renderer.ts optional method
setFallbackContext?(ctx: CanvasRenderingContext2D | null, dpr: number): void
```

```ts
// chartRenderer
this.sceneRenderer.setFallbackContext?.(mainCtx ?? null, vp.dpr)
```

Note: candle no longer needs overlay as fallback.

---

### Task 7: 文档与 PRD 勾选

**Files:**
- Modify: `.opencode/plans/2026-07-15-render-compat-layer-PRD.md` Phase 1 checkbox
- Optional: `docs/rendering-engine-architecture.md` 一小节「candle 经 Renderer」

- [ ] **Step 1: Update PRD**

```markdown
- [x] Phase 1 — Renderer API 生产落地（candle drawInstances + sceneRenderer 注入）
```

- [ ] **Step 2: Final test**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine src/rendering src/foundation/plugin
```

- [ ] **Step 3: Commit**

```bash
git add .opencode/plans/2026-07-15-render-compat-layer-PRD.md docs/
git commit -m "docs: mark render Phase 1 candle via Renderer done"
```

---

## Testing summary

| Level | What |
|-------|------|
| Unit | `drawCandlesViaRenderer` 4× drawInstances；layer 注入 sceneRenderer；candle 优先 sceneRenderer |
| Regression | `chart.dpr`、layerFromPlugin、webglRenderer.fallback |
| Manual | 见 Task 4 清单 |

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/engine/renderers/__tests__/candleViaRenderer.test.ts src/engine/renderers/__tests__/candle.sceneRenderer.test.ts src/rendering/scene/__tests__/layerFromPlugin.test.ts
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| sceneRenderer 与 pane candleSurface 双 surface 坐标不一致 | candle 只走 sceneRenderer；beginFrame region 与 pane 对齐 |
| 每帧 createPipeline/createBuffer 开销 | Task 1 可后续改为 Layer 私有缓存 pipeline/buffer（YAGNI 先正确） |
| composite 区域错误导致空白 | Task 4 手测 + region 与 renderPanes 同构 |
| 旧测试依赖 candleWebGLSurface | 更新 mock 提供 sceneRenderer |

---

## Self-review vs PRD Phase 1

| PRD 项 | Task |
|--------|------|
| candle 经 drawInstances | Task 1 + 3 |
| 不读 candleWebGLSurface（软废弃） | Task 5 |
| fallback 正确 | Task 3 Canvas2D + Task 6 optional |
| 无视觉回归 | Task 4 manual |
| line helper | **Out of scope** — 记 Phase 1.1 |
| writeBuffer 去 ArrayBuffer 中转 | **Out of scope** — Phase 2 |

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-15-render-phase1-candle-renderer.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans checkpoints  

Which approach?
