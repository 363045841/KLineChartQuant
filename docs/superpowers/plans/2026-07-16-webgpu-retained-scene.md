# WebGPU Retained Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade WebGPU from per-draw temporary buffers and multi-submit to retained scene nodes with one chart-frame submit, then hybrid DOM composition.

**Architecture:** RetainedScene stores stable SceneNodes; WebGPU ResourceTable reuses GPUBuffers by key/revision; createWebGPURenderer records draws between beginFrame/endFrame and submits once in flushChartFrame. M2 mounts a visible GPU canvas between underlay and overlay and removes compositeTo.

**Tech Stack:** TypeScript, WebGPU, Vitest, existing Renderer/Scene contracts in `packages/core`.

**Spec:** `docs/superpowers/specs/2026-07-16-webgpu-retained-scene-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/core/src/rendering/render/frameMetrics.ts` | Dev/test frame counters |
| `packages/core/src/rendering/scene/retainedScene.ts` | SceneNode store, upsert, prune |
| `packages/core/src/rendering/render/webgpuResourceTable.ts` | GPUBuffer reuse by key/revision |
| `packages/core/src/rendering/render/createWebGPURenderer.ts` | Record draws; single submit flush |
| `packages/core/src/engine/render/chartRenderer.ts` | beginChartFrame / flushChartFrame wiring |
| `packages/core/src/engine/renderers/*ViaRenderer.ts` | Optional stable keys later |
| Tests under `packages/core/src/rendering/**/__tests__/` | TDD coverage |

---

### Task 1: Frame metrics harness (M0)

**Files:**
- Create: `packages/core/src/rendering/render/frameMetrics.ts`
- Create: `packages/core/src/rendering/render/__tests__/frameMetrics.test.ts`
- Modify: `packages/core/src/rendering/render/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { createFrameMetrics, resetFrameMetrics, getFrameMetrics } from '../frameMetrics'

it('counts submits uploads and buffer creates per frame', () => {
  resetFrameMetrics()
  const m = createFrameMetrics()
  m.beginFrame()
  m.recordBufferCreate()
  m.recordUpload(64)
  m.recordDraw()
  m.recordSubmit()
  m.recordComposite()
  m.endFrame()
  expect(getFrameMetrics()).toMatchObject({
    bufferCreateCount: 1,
    bufferUploadBytes: 64,
    drawCallCount: 1,
    queueSubmitCount: 1,
    compositeCount: 1,
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/render/__tests__/frameMetrics.test.ts
```

- [ ] **Step 3: Implement minimal frameMetrics**

```ts
export type FrameMetricsSnapshot = {
  bufferCreateCount: number
  bufferUploadBytes: number
  drawCallCount: number
  queueSubmitCount: number
  compositeCount: number
}

let snapshot: FrameMetricsSnapshot = empty()

function empty(): FrameMetricsSnapshot {
  return {
    bufferCreateCount: 0,
    bufferUploadBytes: 0,
    drawCallCount: 0,
    queueSubmitCount: 0,
    compositeCount: 0,
  }
}

export function resetFrameMetrics(): void {
  snapshot = empty()
}

export function getFrameMetrics(): FrameMetricsSnapshot {
  return { ...snapshot }
}

export function createFrameMetrics() {
  let current = empty()
  return {
    beginFrame(): void {
      current = empty()
    },
    recordBufferCreate(): void {
      current.bufferCreateCount += 1
    },
    recordUpload(bytes: number): void {
      current.bufferUploadBytes += bytes
    },
    recordDraw(): void {
      current.drawCallCount += 1
    },
    recordSubmit(): void {
      current.queueSubmitCount += 1
    },
    recordComposite(): void {
      current.compositeCount += 1
    },
    endFrame(): void {
      snapshot = { ...current }
    },
  }
}
```

- [ ] **Step 4: Export from index; run tests PASS**

- [ ] **Step 5: Commit** (only when user asks)

---

### Task 2: RetainedScene (M1)

**Files:**
- Create: `packages/core/src/rendering/scene/retainedScene.ts`
- Create: `packages/core/src/rendering/scene/__tests__/retainedScene.test.ts`

- [ ] **Step 1: Failing tests for upsert, scroll-without-revision-change policy helper, prune**

```ts
it('upserts by key and replaces geometry when revision changes', () => {
  const scene = createRetainedScene()
  scene.beginFrame(1)
  scene.upsert({
    kind: 'rects',
    key: 'main/candle/upBody',
    revision: 1,
    instances: new Float32Array([0, 0, 1, 2]),
    count: 1,
    color: '#0f0',
    scrollLeft: 0,
    z: 10,
    paneId: 'main',
  })
  scene.upsert({
    kind: 'rects',
    key: 'main/candle/upBody',
    revision: 2,
    instances: new Float32Array([1, 1, 1, 2]),
    count: 1,
    color: '#0f0',
    scrollLeft: 5,
    z: 10,
    paneId: 'main',
  })
  const nodes = scene.collectVisible('main')
  expect(nodes).toHaveLength(1)
  expect(nodes[0]?.revision).toBe(2)
  expect(nodes[0]?.scrollLeft).toBe(5)
})

it('prunes keys not touched for N frames', () => {
  const scene = createRetainedScene({ staleFrames: 2 })
  scene.beginFrame(1)
  scene.upsert({ kind: 'rects', key: 'a', revision: 1, instances: new Float32Array(4), count: 1, color: '#fff', scrollLeft: 0, z: 0, paneId: 'main' })
  scene.endFrame()
  scene.beginFrame(2)
  scene.endFrame()
  scene.beginFrame(3)
  const removed = scene.prune()
  expect(removed).toEqual(['a'])
  expect(scene.collectVisible('main')).toEqual([])
})
```

- [ ] **Step 2: Implement createRetainedScene**

Types from spec section 6. Methods: `beginFrame(frameNumber)`, `upsert(node)`, `collectVisible(paneId?)`, `endFrame()`, `prune(): string[]`, `clear()`.

- [ ] **Step 3: Tests PASS**

---

### Task 3: WebGPU ResourceTable (M1)

**Files:**
- Create: `packages/core/src/rendering/render/webgpuResourceTable.ts`
- Create: `packages/core/src/rendering/render/__tests__/webgpuResourceTable.test.ts`

- [ ] **Step 1: Failing test — upload only on revision change; grow capacity**

Use fake device with `createBuffer` / `queue.writeBuffer` spies.

```ts
it('reuses buffer when revision unchanged', () => {
  const table = createWebGPUResourceTable({ device: fakeDevice, metrics })
  const data = new Float32Array([1, 2, 3, 4])
  const a = table.ensureUploaded({ key: 'k', revision: 1, data, usage: 'vertex' })
  const b = table.ensureUploaded({ key: 'k', revision: 1, data, usage: 'vertex' })
  expect(a.buffer).toBe(b.buffer)
  expect(fakeDevice.createBuffer).toHaveBeenCalledTimes(1)
  expect(fakeDevice.queue.writeBuffer).toHaveBeenCalledTimes(1)
})

it('uploads again when revision changes', () => {
  const table = createWebGPUResourceTable({ device: fakeDevice, metrics })
  table.ensureUploaded({ key: 'k', revision: 1, data: new Float32Array([1, 2, 3, 4]), usage: 'vertex' })
  table.ensureUploaded({ key: 'k', revision: 2, data: new Float32Array([5, 6, 7, 8]), usage: 'vertex' })
  expect(fakeDevice.createBuffer).toHaveBeenCalledTimes(1)
  expect(fakeDevice.queue.writeBuffer).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Implement ensureUploaded / destroyKey / destroyAll**

- [ ] **Step 3: Tests PASS**

---

### Task 4: Deferred submit in createWebGPURenderer (M1)

**Files:**
- Modify: `packages/core/src/rendering/render/createWebGPURenderer.ts`
- Modify: `packages/core/src/rendering/render/__tests__/webgpuRenderer.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('records multiple draws and submits once on endFrame', async () => {
  const fake = makeWebGPU()
  const renderer = await createWebGPURenderer({ gpu: fake.gpu as GPU, canvas: fake.canvas })
  renderer.surface.resize(200, 100, 1)
  renderer.beginFrame({ x: 0, y: 0, width: 200, height: 100, dpr: 1 })
  const pipeline = renderer.createPipeline({ type: 'candle' })
  const instances = renderer.createBuffer('instance', 16)
  renderer.writeBuffer(instances, new Float32Array([0, 0, 10, 20]))
  const vertices = renderer.createBuffer('vertex', 4)
  const params = {
    pipeline,
    vertices,
    instances,
    instanceCount: 1,
    vertexCount: 6,
    uniforms: { color: '#f00', scrollLeft: 0 },
  }
  expect(renderer.drawInstances(params)).toBe(true)
  expect(renderer.drawInstances(params)).toBe(true)
  expect(fake.queue.submit).not.toHaveBeenCalled()
  renderer.endFrame()
  expect(fake.queue.submit).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Refactor renderer**

Internal pending draw list per frame:
- `drawInstances` / `drawLines` push commands, return true/false for validation only.
- `endFrame` builds one encoder, one or more pane passes, single `queue.submit`.
- Wire frameMetrics.
- Keep compositeTo available (M1 does not remove it).

- [ ] **Step 3: Update existing tests that expected immediate submit**

- [ ] **Step 4: All webgpuRenderer tests PASS**

---

### Task 5: ChartRenderer chart-frame flush (M1)

**Files:**
- Modify: `packages/core/src/engine/render/chartRenderer.ts` (`renderPanes`)
- Test: extend or add chart/render unit if feasible; otherwise rely on renderer unit tests + manual checklist

- [ ] **Step 1:** After all panes `paintPane`, ensure `sceneRenderer.endFrame()` once per chart draw (not only per pane if multi-pane). Preferred API:

```ts
// per pane
sceneRenderer.beginFrame(region)
scene.paintPane(...)
// after all panes
sceneRenderer.endFrame()
```

If current code calls endFrame per pane, change to: beginFrame per pane (bind region + queue pane draws), endFrame once after loop.

- [ ] **Step 2:** Multi-pane test or fake renderer asserting single endFrame submit.

---

### Task 6: M2 Hybrid DOM (after M1 green)

**Files:**
- `createWebGPUSurfaceBackend.ts` — optional getCanvas / style sizing
- Vue/chart DOM mount for gpu canvas
- Remove WebGPU `compositeTo` from candle/lines helpers when effective backend is webgpu
- underlay/overlay role split in ChartRenderer paint

Checklist from spec §11 M2. Separate commit series.

---

### Task 7: M3 Hardening

- Host switch clears ResourceTable + RetainedScene
- device lost path
- prune + leak tests
- metrics gate documentation

---

## Verification commands

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/render/__tests__/frameMetrics.test.ts
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/scene/__tests__/retainedScene.test.ts
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/render/__tests__/webgpuResourceTable.test.ts
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/render/__tests__/webgpuRenderer.test.ts
pnpm --filter @363045841yyt/klinechart-core build
```

## Spec coverage

| Spec item | Task |
|-----------|------|
| Frame metrics M0 | Task 1 |
| RetainedScene | Task 2 |
| ResourceTable | Task 3 |
| Single submit | Task 4–5 |
| Hybrid DOM | Task 6 |
| Hardening | Task 7 |
| Compute excluded | N/A |
