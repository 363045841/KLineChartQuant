/** 真实浏览器像素回归：直接调用后端能力，禁止静默 Canvas 回退掩盖 GPU 失败。 */
import { createCanvas2DRenderer } from '../../packages/core/src/rendering/render/backend/createCanvas2DRenderer'
import { createWebGPURenderer } from '../../packages/core/src/rendering/render/backend/createWebGPURenderer'
import { createWebGLPrimitiveBackend } from '../../packages/core/src/rendering/primitives/impl/webgl'
import { rectPath } from '../../packages/core/src/rendering/primitives/impl/geometry'
import type { PaintPrimitive, PrimitiveBackend } from '../../packages/core/src/rendering/primitives/types'

/** 像素断言包含后端和 DPR，便于直接定位浏览器差异。 */
function check(value: boolean, message: string): void { if (!value) throw new Error(message) }

/** 使用真实原语契约生成路径、孔洞、dash、字形和透明重叠场景。 */
function commands(): PaintPrimitive[] {
  return [
    { kind: 'fill', paths: [[{ x: 8, y: 8 }, { x: 48, y: 8 }, { x: 48, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 48 }, { x: 8, y: 48 }]], color: 'rgba(255,0,0,0.5)' },
    { kind: 'fill', paths: [rectPath(60, 8, 40, 40), [...rectPath(70, 18, 20, 20)].reverse()], color: 'blue' },
    { kind: 'fill', paths: [rectPath(110, 8, 40, 40), rectPath(120, 18, 20, 20)], fillRule: 'evenodd', color: 'green' },
    { kind: 'fill', paths: [rectPath(8, 60, 30, 30), rectPath(20, 70, 30, 30)], color: 'rgba(255,0,0,0.5)' },
    { kind: 'stroke', paths: [[{ x: 60, y: 60 }, { x: 80, y: 60 }, { x: 80, y: 85 }]], width: 4, dash: [12, 6], cap: 'butt', join: 'round', color: 'blue' },
    { kind: 'circle', x: 115, y: 75, radius: 10, color: 'red' },
    { kind: 'rect', x: 135, y: 60, width: 20, height: 30, radius: 5, color: 'blue' },
    { kind: 'text', text: 'Ab中', x: 8, y: 110, font: '16px sans-serif', color: 'red', align: 'left', baseline: 'top' },
    { kind: 'text', text: 'Rotate', x: 110, y: 115, font: '14px sans-serif', color: 'blue', align: 'center', baseline: 'middle', rotation: -0.3 },
    { kind: 'stroke', paths: [[{ x: 60, y: 105 }, { x: 85, y: 105 }, { x: 85, y: 130 }]], width: 8, cap: 'round', join: 'miter', color: 'rgba(255,0,0,0.5)' },
  ]
}

/** 验证实际后端返回成功、填充规则、透明度、文字和跨批次保留行为。 */
async function run() {
  const canvasRenderer = createCanvas2DRenderer()
  const gpuRenderer = await createWebGPURenderer()
  const gl = createWebGLPrimitiveBackend()
  const backends: Array<{ name: string; backend: PrimitiveBackend | undefined }> = [
    { name: 'canvas2d', backend: canvasRenderer.primitives }, { name: 'webgl2', backend: gl }, { name: 'webgpu', backend: gpuRenderer.primitives },
  ]
  const results: Array<{ name: string; dpr: number; textPixels: number }> = []
  try {
    for (const { name, backend } of backends) for (const dpr of [1, 1.25, 1.5, 2]) {
      check(!!backend, `${name}: missing backend`)
      const canvas = document.createElement('canvas')
      canvas.width = 160 * dpr; canvas.height = 140 * dpr
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.scale(dpr, dpr)
      check(backend!.paint(ctx, commands(), dpr), `${name}/${dpr}: GPU paint failed`)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const alpha = (x: number, y: number) => pixels[(Math.floor(y * dpr) * canvas.width + Math.floor(x * dpr)) * 4 + 3]!
      check(Math.abs(alpha(12, 12) - 128) <= 1 && alpha(35, 35) === 0, `${name}/${dpr}: concave fill`)
      check(alpha(65, 15) === 255 && alpha(80, 30) === 0, `${name}/${dpr}: nonzero hole`)
      check(alpha(115, 15) === 255 && alpha(130, 30) === 0, `${name}/${dpr}: evenodd hole`)
      check(Math.abs(alpha(25, 75) - 128) <= 1, `${name}/${dpr}: transparent overlap`)
      check(alpha(65, 60) === 255 && alpha(75, 60) === 0 && alpha(80, 65) === 255, `${name}/${dpr}: continuous dash`)
      check(alpha(115, 75) === 255 && alpha(135, 60) === 0 && alpha(145, 75) === 255, `${name}/${dpr}: shapes`)
      check(Math.abs(alpha(85, 105) - 128) <= 1, `${name}/${dpr}: transparent stroke join`)
      let textPixels = 0
      for (let y = 110 * dpr; y < 130 * dpr; y++) for (let x = 8 * dpr; x < 48 * dpr; x++) {
        if (pixels[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3]! > 0) textPixels++
      }
      check(textPixels > 50, `${name}/${dpr}: text missing`)
      // 第二批模拟预览刷新，不能清除目标已有的正式图元。
      check(backend!.paint(ctx, [{ kind: 'circle', x: 152, y: 130, radius: 3, color: 'green' }], dpr), `${name}/${dpr}: second batch failed`)
      check(ctx.getImageData(Math.floor(12 * dpr), Math.floor(12 * dpr), 1, 1).data[3] === alpha(12, 12), `${name}/${dpr}: previous batch lost`)
      results.push({ name, dpr, textPixels })
    }
    return results
  } finally { gl.dispose(); canvasRenderer.dispose(); gpuRenderer.dispose() }
}

const output = document.getElementById('result')!
run().then(results => { output.textContent = JSON.stringify({ status: 'passed', results }) }, error => { output.textContent = JSON.stringify({ status: 'failed', error: String(error) }) })
