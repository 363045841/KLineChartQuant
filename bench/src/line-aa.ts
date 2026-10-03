/** 用真实 WebGL shader 和像素读回验证解析 AA、DPR、蜡烛状态及填充带。 */
import {
  CandleWebGLSurface,
  LineWebGLSurface,
} from '../../packages/core/src/engine/renderers/webgl/candleSurface'
import { SharedWebGLSurface } from '../../packages/core/src/engine/renderers/webgl/sharedWebGLSurface'
import { prepareLineStripForPhysicalPixels } from '../../packages/core/src/rendering/render/physicalLine'

/** 检查条件，失败时让页面输出可定位的诊断。 */
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

/** 在各 DPR 下读回近水平细线的连续 alpha，并检查实心图元。 */
function runPixelChecks(): Array<{ dpr: number; edgeAlphaLevels: number }> {
  const shared = new SharedWebGLSurface()
  const lines = new LineWebGLSurface(shared)
  const candles = new CandleWebGLSurface(shared)
  const gl = shared.getGL()
  if (!gl) throw new Error('WebGL2 unavailable')
  check(lines.isAvailable() && candles.isAvailable(), 'Shader compilation failed')
  const results: Array<{ dpr: number; edgeAlphaLevels: number }> = []
  try {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const region = { x: 0, y: 0, width: 128, height: 64, dpr }
      shared.resize(region.width, region.height, dpr)
      lines.resize(region.width, region.height, dpr)
      candles.resize(region.width, region.height, dpr)
      lines.setRegion(region)
      candles.setRegion(region)
      check(shared.beginFrame({ clear: true }), 'beginFrame failed')
      // 先画不透明蜡烛，覆盖会关闭 BLEND 的真实调用顺序。
      check(
        candles.drawRectBuffer(new Float32Array([8, 40, 16, 12]), 1, '#ffffff', 0),
        'Candle draw failed',
      )
      const strip = prepareLineStripForPhysicalPixels(
        {
          points: [
            { x: 8, y: 10.2 },
            { x: 120, y: 13.8 },
          ],
          width: 1,
          color: '#ffffff',
        },
        dpr,
      )
      check(lines.drawLineStrips([{ ...strip, width: strip.width ?? 1 }], 0), 'Line draw failed')
      check(
        lines.drawFilledBand(
          {
            upperPoints: [
              { x: 40, y: 40 },
              { x: 80, y: 40 },
            ],
            lowerPoints: [
              { x: 40, y: 52 },
              { x: 80, y: 52 },
            ],
          },
          'rgba(255,255,255,0.5)',
          0,
        ),
        'Fill draw failed',
      )
      shared.endFrame()
      const canvas = shared.getCanvas()
      const pixels = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      check(gl.getError() === gl.NO_ERROR, 'WebGL error')
      // readPixels 的原点在左下角，输入坐标以左上角为原点。
      const alphaAt = (x: number, y: number): number =>
        pixels[((canvas.height - 1 - y) * canvas.width + x) * 4 + 3]!
      const alphaLevels = new Set<number>()
      for (let x = Math.ceil(12 * dpr); x < Math.floor(116 * dpr); x++) {
        for (let y = Math.floor(8 * dpr); y < Math.ceil(16 * dpr); y++) {
          const alpha = alphaAt(x, y)
          if (alpha > 0 && alpha < 255) alphaLevels.add(alpha)
        }
      }
      // 4x MSAA 单独只能给出有限覆盖等级；大量中间值证明 shader coverage 生效。
      check(
        alphaLevels.size > 16,
        `DPR ${dpr}: insufficient alpha transition (${alphaLevels.size})`,
      )
      check(
        alphaAt(Math.round(16 * dpr), Math.round(46 * dpr)) === 255,
        'Candle must remain opaque',
      )
      check(
        Math.abs(alphaAt(Math.round(60 * dpr), Math.round(46 * dpr)) - 128) <= 1,
        'Fill alpha must stay uniform',
      )
      results.push({ dpr, edgeAlphaLevels: alphaLevels.size })
      // 同一数组原地移动后必须重建几何，避免引用缓存残留旧线。
      for (const point of strip.points) point.y += 12
      check(shared.beginFrame({ clear: true }), 'Cache check beginFrame failed')
      check(
        lines.drawLineStrips([{ ...strip, width: strip.width ?? 1 }], 0),
        'Cache check draw failed',
      )
      shared.endFrame()
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      check(
        alphaAt(Math.round(64 * dpr), Math.round(12 * dpr)) === 0,
        'Old cached line must disappear',
      )
      check(alphaAt(Math.round(64 * dpr), Math.round(24 * dpr)) > 0, 'Mutated line must move')
    }
    return results
  } finally {
    lines.destroy()
    candles.destroy()
    shared.destroy()
  }
}

const result = document.getElementById('result')
if (result) {
  try {
    result.textContent = JSON.stringify({ status: 'passed', results: runPixelChecks() })
  } catch (error) {
    result.textContent = JSON.stringify({ status: 'failed', error: String(error) })
  }
}
