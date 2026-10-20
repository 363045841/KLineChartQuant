/** 真实浏览器像素回归：直接调用后端能力，禁止静默 Canvas 回退掩盖 GPU 失败。 */

import { rectPath } from '../../packages/core/src/rendering/primitives/impl/geometry'
import { createGpuPrimitiveBackend } from '../../packages/core/src/rendering/primitives/impl/gpu'
import { createWebGLPrimitiveBackend } from '../../packages/core/src/rendering/primitives/impl/webgl'
import type {
  PaintPrimitive,
  PrimitiveBackend,
  PrimitiveMetrics,
} from '../../packages/core/src/rendering/primitives/types'
import { createCanvas2DRenderer } from '../../packages/core/src/rendering/render/backend/createCanvas2DRenderer'
import { createWebGPURenderer } from '../../packages/core/src/rendering/render/backend/createWebGPURenderer'
import { runCompositionChecks } from './composition'

/** 像素断言包含后端和 DPR，便于直接定位浏览器差异。 */
function check(value: boolean, message: string): void {
  if (!value) throw new Error(message)
}

/** 使用真实原语契约生成路径、孔洞、dash、字形和透明重叠场景。 */
function commands(): PaintPrimitive[] {
  return [
    {
      kind: 'fill',
      paths: [
        [
          { x: 8, y: 8 },
          { x: 48, y: 8 },
          { x: 48, y: 20 },
          { x: 20, y: 20 },
          { x: 20, y: 48 },
          { x: 8, y: 48 },
        ],
      ],
      color: 'rgba(255,0,0,0.5)',
    },
    {
      kind: 'fill',
      paths: [rectPath(60, 8, 40, 40), [...rectPath(70, 18, 20, 20)].reverse()],
      color: 'blue',
    },
    {
      kind: 'fill',
      paths: [rectPath(110, 8, 40, 40), rectPath(120, 18, 20, 20)],
      fillRule: 'evenodd',
      color: 'green',
    },
    {
      kind: 'fill',
      paths: [rectPath(8, 60, 30, 30), rectPath(20, 70, 30, 30)],
      color: 'rgba(255,0,0,0.5)',
    },
    {
      kind: 'stroke',
      paths: [
        [
          { x: 60, y: 60 },
          { x: 80, y: 60 },
          { x: 80, y: 85 },
        ],
      ],
      width: 4,
      dash: [12, 6],
      cap: 'butt',
      join: 'round',
      color: 'blue',
    },
    { kind: 'circle', x: 115, y: 75, radius: 10, color: 'red' },
    { kind: 'rect', x: 135, y: 60, width: 20, height: 30, radius: 5, color: 'blue' },
    {
      kind: 'text',
      text: 'Ab中',
      x: 8,
      y: 110,
      font: '16px sans-serif',
      color: 'red',
      align: 'left',
      baseline: 'top',
    },
    {
      kind: 'text',
      text: 'Rotate',
      x: 110,
      y: 115,
      font: '14px sans-serif',
      color: 'blue',
      align: 'center',
      baseline: 'middle',
      rotation: -0.3,
    },
    {
      kind: 'stroke',
      paths: [
        [
          { x: 60, y: 105 },
          { x: 85, y: 105 },
          { x: 85, y: 130 },
        ],
      ],
      width: 8,
      cap: 'round',
      join: 'miter',
      color: 'rgba(255,0,0,0.5)',
    },
    // 文字后的几何必须仍覆盖文字，不能为了合批把所有文字统一移到最后。
    {
      kind: 'text',
      text: 'MMMM',
      x: 5,
      y: 132,
      font: '12px sans-serif',
      color: 'blue',
      align: 'left',
      baseline: 'top',
    },
    { kind: 'rect', x: 5, y: 132, width: 45, height: 8, color: 'red' },
  ]
}

/** 验证实际后端返回成功、填充规则、透明度、文字和跨批次保留行为。 */
async function run() {
  const canvasRenderer = createCanvas2DRenderer()
  const gpuRenderer = await createWebGPURenderer()
  const gl = createWebGLPrimitiveBackend()
  const backends: Array<{ name: string; backend: PrimitiveBackend }> = [
    { name: 'canvas2d', backend: canvasRenderer.primitives },
    { name: 'webgl2', backend: gl },
    { name: 'webgpu', backend: gpuRenderer.primitives },
  ]
  const results: Array<{ name: string; dpr: number; textPixels: number }> = []
  try {
    for (const { name, backend } of backends)
      for (const dpr of [1, 1.25, 1.5, 2]) {
        const canvas = document.createElement('canvas')
        canvas.width = 160 * dpr
        canvas.height = 140 * dpr
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.scale(dpr, dpr)
        check(backend.paint(ctx, commands(), dpr), `${name}/${dpr}: GPU paint failed`)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const alpha = (x: number, y: number) =>
          pixels[(Math.floor(y * dpr) * canvas.width + Math.floor(x * dpr)) * 4 + 3]!
        check(
          Math.abs(alpha(12, 12) - 128) <= 1 && alpha(35, 35) === 0,
          `${name}/${dpr}: concave fill`,
        )
        check(alpha(65, 15) === 255 && alpha(80, 30) === 0, `${name}/${dpr}: nonzero hole`)
        check(alpha(115, 15) === 255 && alpha(130, 30) === 0, `${name}/${dpr}: evenodd hole`)
        check(Math.abs(alpha(25, 75) - 128) <= 1, `${name}/${dpr}: transparent overlap`)
        check(
          alpha(65, 60) === 255 && alpha(75, 60) === 0 && alpha(80, 65) === 255,
          `${name}/${dpr}: continuous dash`,
        )
        check(
          alpha(115, 75) === 255 && alpha(135, 60) === 0 && alpha(145, 75) === 255,
          `${name}/${dpr}: shapes`,
        )
        check(Math.abs(alpha(85, 105) - 128) <= 1, `${name}/${dpr}: transparent stroke join`)
        let textPixels = 0
        for (let y = 110 * dpr; y < 130 * dpr; y++)
          for (let x = 8 * dpr; x < 48 * dpr; x++) {
            if (pixels[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3]! > 0) textPixels++
          }
        check(textPixels > 50, `${name}/${dpr}: text missing`)
        const covered = ctx.getImageData(Math.floor(12 * dpr), Math.floor(135 * dpr), 1, 1).data
        check(covered[0] === 255 && covered[2] === 0, `${name}/${dpr}: Canvas text order changed`)
        // 第二批模拟预览刷新，不能清除目标已有的正式图元。
        check(
          backend.paint(ctx, [{ kind: 'circle', x: 152, y: 130, radius: 3, color: 'green' }], dpr),
          `${name}/${dpr}: second batch failed`,
        )
        check(
          ctx.getImageData(Math.floor(12 * dpr), Math.floor(12 * dpr), 1, 1).data[3] ===
            alpha(12, 12),
          `${name}/${dpr}: previous batch lost`,
        )
        results.push({ name, dpr, textPixels })
      }
    for (const { name, backend } of backends) checkBatchSemantics(name, backend)
    checkAtomicFallback()
    const benchmarks = []
    for (const { name, backend } of backends)
      if (backend.getMetrics) benchmarks.push(await benchmark(name, backend))
    const composition = await runCompositionChecks()
    return { pixels: results, benchmarks, composition }
  } finally {
    gl.dispose()
    canvasRenderer.dispose()
    gpuRenderer.dispose()
  }
}

/** 透明实例、复杂路径和描边不能因为合批改变独立绘制的混合结果。 */
function checkBatchSemantics(name: string, backend: PrimitiveBackend): void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 100
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  check(
    backend.paint(
      ctx,
      [
        { kind: 'rect', x: 5, y: 5, width: 20, height: 20, color: 'rgba(255,0,0,0.5)' },
        { kind: 'rect', x: 10, y: 10, width: 20, height: 20, color: 'rgba(0,0,255,0.5)' },
        {
          kind: 'circle',
          x: 70,
          y: 20,
          radius: 10,
          color: '#ffffff',
          strokeColor: '#ff0000',
          strokeWidth: 4,
        },
        {
          kind: 'fill',
          paths: [rectPath(5, 50, 25, 25), rectPath(8, 53, 3, 3)],
          color: 'rgba(255,0,0,0.5)',
        },
        {
          kind: 'fill',
          paths: [rectPath(15, 60, 25, 25), rectPath(18, 63, 3, 3)],
          color: 'rgba(0,0,255,0.5)',
        },
      ],
      1,
    ),
    `${name}: overlap batch failed`,
  )
  const pixel = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data
  const instanceOverlap = pixel(15, 15),
    stencilOverlap = pixel(20, 65)
  check(
    Math.abs(instanceOverlap[3]! - 192) <= 1 && instanceOverlap[2]! > instanceOverlap[0]!,
    `${name}: instance alpha/order changed`,
  )
  check(
    Math.abs(stencilOverlap[3]! - 192) <= 1 && stencilOverlap[2]! > stencilOverlap[0]!,
    `${name}: stencil alpha/order changed`,
  )
  check(
    pixel(70, 20)[1] === 255 &&
      pixel(80, 20)[1] === 0 &&
      pixel(80, 20)[0] === 255 &&
      pixel(84, 20)[3] === 0,
    `${name}: instanced anchor border changed`,
  )
  const points = [
    { x: 10, y: 30 },
    { x: 60, y: 40 },
    { x: 70, y: 45 },
  ]
  const line: PaintPrimitive = {
    kind: 'stroke',
    paths: [points],
    width: 4,
    join: 'round',
    color: '#ff0000',
  }
  ctx.clearRect(0, 0, 100, 100)
  check(backend.paint(ctx, [line], 1), `${name}: mutable path first draw failed`)
  for (const point of points) point.y += 20
  ctx.clearRect(0, 0, 100, 100)
  check(backend.paint(ctx, [line], 1), `${name}: mutable path second draw failed`)
  check(pixel(35, 35)[3] === 0 && pixel(35, 55)[3]! > 0, `${name}: stale geometry after mutation`)
}

/** 故障注入使用真实 Canvas 验证图文混合后半段失败不会污染可见目标。 */
function checkAtomicFallback(): void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 40
  const target = canvas.getContext('2d', { willReadFrequently: true })!
  target.fillStyle = '#00ff00'
  target.fillRect(0, 0, 40, 40)
  let renders = 0
  const backend = createGpuPrimitiveBackend((document) => ({
    render() {
      if (++renders === 2) throw new Error('Injected second-segment failure')
      const image = document.createElement('canvas')
      image.width = image.height = 40
      const context = image.getContext('2d')!
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, 40, 40)
      return {
        canvas: image,
        metrics: { drawCalls: 1, uploads: 1, uploadedBytes: 64, submissions: 1 },
      }
    },
    async waitForIdle() {},
    dispose() {},
  }))
  check(
    !backend.paint(
      target,
      [
        { kind: 'circle', x: 10, y: 10, radius: 5, color: '#ff0000' },
        {
          kind: 'text',
          text: 'A',
          x: 10,
          y: 10,
          font: '12px sans-serif',
          color: '#000000',
          align: 'left',
          baseline: 'top',
        },
        { kind: 'circle', x: 20, y: 20, radius: 5, color: '#ff0000' },
      ],
      1,
    ),
    'Mixed batch should fail atomically',
  )
  const pixel = target.getImageData(10, 10, 1, 1).data
  check(
    pixel[0] === 0 && pixel[1] === 255 && pixel[2] === 0,
    'Failed mixed batch polluted visible target',
  )
  backend.dispose()
}

/** 在真实后端上测量重复整层绘制；使用几何场景而不构造假的行情序列。 */
async function benchmark(name: string, backend: PrimitiveBackend) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const target = canvas.getContext('2d')!
  const geometry: PaintPrimitive[] = []
  for (let i = 0; i < 4096; i++) {
    const x = (i % 128) * 8,
      y = Math.floor(i / 128) * 8
    geometry.push(
      i % 2
        ? { kind: 'rect', x, y, width: 5, height: 5, radius: 2, color: '#4c77c6' }
        : { kind: 'circle', x, y, radius: 2, color: '#e03c31' },
    )
  }
  for (let i = 0; i < 128; i++)
    geometry.push({
      kind: 'stroke',
      color: '#4c77c6',
      width: 1,
      paths: [
        [
          { x: 10, y: 260 + i },
          { x: 1010, y: 260 + i },
        ],
      ],
    })
  for (let i = 0; i < 256; i++)
    geometry.push({ kind: 'circle', x: 2000 + i, y: 100, radius: 4, color: '#4c77c6' })
  check(backend.paint(target, geometry, 1), `${name}: benchmark cold paint failed`)
  await backend.waitForIdle?.()
  const cold = backend.getMetrics!()
  let warm: Readonly<PrimitiveMetrics> = cold
  const cpuMs: number[] = [],
    completionMs: number[] = []
  for (let i = 0; i < 30; i++) {
    target.clearRect(0, 0, canvas.width, canvas.height)
    const start = performance.now()
    check(backend.paint(target, geometry, 1), `${name}: benchmark paint failed`)
    cpuMs.push(performance.now() - start)
    warm = backend.getMetrics!()
    await backend.waitForIdle?.()
    completionMs.push(performance.now() - start)
  }
  check(warm.drawCalls === 2, `${name}: expected 2 draws, got ${warm.drawCalls}`)
  check(warm.culled === 256, `${name}: offscreen shapes were not culled`)
  check(warm.geometryBuilds === 0 && warm.geometryHits === 128, `${name}: geometry cache missed`)
  check(warm.uploads === 0 && warm.uploadedBytes === 0, `${name}: unchanged buffers uploaded`)
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    name,
    primitives: geometry.length,
    cold,
    warm,
    cpuMeanMs: average(cpuMs),
    completionMeanMs: average(completionMs),
    timing: 'CPU paint and completion wall time; not GPU timestamp',
  }
}

const output = document.getElementById('result')!
run().then(
  (results) => {
    output.textContent = JSON.stringify({ status: 'passed', results })
  },
  (error) => {
    output.textContent = JSON.stringify({ status: 'failed', error: String(error) })
  },
)
