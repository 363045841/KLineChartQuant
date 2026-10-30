/** 整张真实 Chart 的合成回归：实际 Pane DOM、Scene、后端切换及截图，不使用 GPU 替身。 */

import { mountChartDom } from '../../packages/core/src/controllers/chart/impl/mountChartDom'
import { Chart } from '../../packages/core/src/engine/chart/impl/chart'
import { loadSystemIndicators } from '../../packages/core/src/engine/indicators/registerBuiltins'
import type { RenderContext } from '../../packages/core/src/foundation/plugin'
import { primitiveSink } from '../../packages/core/src/rendering/primitives/impl/paint'
import type { PaintPrimitive } from '../../packages/core/src/rendering/primitives/types'
import { createDefaultRendererHost } from '../../packages/core/src/rendering/render/createDefaultRendererHost'
import type { Layer } from '../../packages/core/src/rendering/scene/types'
import { SCENE_TARGET_Z } from '../../packages/core/src/rendering/scene/types'
import { captureChartImage } from '../../packages/vue/src/composables/chart/captureChartImage'

/** 失败信息直接写入浏览器回归结果。 */
function check(value: boolean, message: string): void {
  if (!value) throw new Error(message)
}

/** 挂载指定角色的真实 Layer，所有后端都使用 Scene 注入的同一个目标。 */
function layer(
  id: string,
  role: Layer['role'],
  z: number,
  commands: PaintPrimitive[],
): Layer<RenderContext> {
  return {
    id,
    role,
    z,
    pane: 'main',
    visible: true,
    paint(context) {
      primitiveSink(context.sceneRenderer?.primitives)(context.ctx, commands, context.dpr)
    },
    dispose() {},
  }
}

/** 同一张图表连续切换三个真实后端，检查 Scene 顺序与浏览器 DOM 堆叠完全一致。 */
export async function runCompositionChecks() {
  await loadSystemIndicators()
  const root = document.createElement('div')
  root.style.cssText = 'position:relative;width:600px;height:320px;'
  document.body.appendChild(root)
  const mounted = mountChartDom({ container: root })
  const rendererHost = await createDefaultRendererHost('canvas')
  const chart = new Chart(
    mounted,
    {
      kWidth: 10,
      kGap: 2,
      yPaddingPx: 0,
      rightAxisWidth: 60,
      leftAxisWidth: 0,
      bottomAxisHeight: 24,
      minKWidth: 2,
      maxKWidth: 50,
      priceLabelWidth: 60,
      panes: [{ id: 'main', ratio: 1 }],
    },
    { rendererHost, initialSettings: { rendererBackend: 'canvas', showGridLines: false } },
  )
  const results: Array<{
    backend: string
    dpr: number
    mainZ: string
    drawingZ: string
    overlayZ: string
  }> = []
  try {
    chart.useRenderer(
      layer('composition:base', 'primary', 1000, [
        { kind: 'rect', x: 20, y: 40, width: 100, height: 80, color: '#ff0000' },
      ]),
    )
    chart.useRenderer(
      layer('composition:plot', 'indicator', 1001, [
        {
          kind: 'stroke',
          paths: [
            [
              { x: 10, y: 60 },
              { x: 150, y: 60 },
            ],
          ],
          width: 8,
          color: '#0000ff',
        },
      ]),
    )
    chart.useRenderer(
      layer('composition:drawing', 'drawing', -1000, [
        { kind: 'rect', x: 60, y: 50, width: 30, height: 20, color: '#ffff00' },
      ]),
    )
    chart.useRenderer(
      layer('composition:overlay', 'overlay', -1000, [
        { kind: 'rect', x: 75, y: 55, width: 10, height: 10, color: '#00ff00' },
      ]),
    )
    const canvas = root.querySelector<HTMLCanvasElement>('canvas.main-canvas')!
    for (const preference of ['canvas', 'webgl', 'webgpu'] as const) {
      const size = [canvas.width, canvas.height]
      await rendererHost.switchTo(preference)
      check(
        rendererHost.runtime.effective === preference,
        `${preference}: backend silently degraded`,
      )
      check(
        canvas.width === size[0] && canvas.height === size[1],
        `${preference}: switching resized the visible target`,
      )
      chart.draw()
      const main = root.querySelector<HTMLCanvasElement>('canvas.main-canvas')!
      const drawing = root.querySelector<HTMLCanvasElement>('canvas.drawing-canvas')!
      const overlay = root.querySelector<HTMLCanvasElement>('canvas.overlay-canvas')!
      check(
        !root.querySelector('canvas.gpu-scene-canvas'),
        `${preference}: obsolete visible GPU surface remains`,
      )
      check(
        main.style.zIndex === String(SCENE_TARGET_Z.main) &&
          drawing.style.zIndex === String(SCENE_TARGET_Z.drawing) &&
          overlay.style.zIndex === String(SCENE_TARGET_Z.overlay),
        `${preference}: DOM and Scene target order differ`,
      )
      const dpr = chart.getCurrentDpr()
      const blue = main
        .getContext('2d')!
        .getImageData(Math.round(30 * dpr), Math.round(60 * dpr), 1, 1).data
      check(
        blue[0] === 0 && blue[2] === 255,
        `${preference}: indicator was covered by a lower layer`,
      )
      const screenshot = await chart.captureFrame((frame) => {
        check(!('surface' in frame), `${preference}: obsolete GPU screenshot replacement remains`)
        return captureChartImage(root, frame, '#ffffff')
      })
      const origin = root.getBoundingClientRect(),
        bounds = main.getBoundingClientRect()
      const context = screenshot.getContext('2d')!
      const pixel = (x: number, y: number) =>
        context.getImageData(
          Math.round((bounds.left - origin.left + x) * dpr),
          Math.round((bounds.top - origin.top + y) * dpr),
          1,
          1,
        ).data
      const blueShot = pixel(30, 60),
        yellowShot = pixel(65, 60),
        greenShot = pixel(80, 60),
        redShot = pixel(30, 80)
      check(
        blueShot[2] === 255 && blueShot[0] === 0,
        `${preference}: screenshot lost the indicator`,
      )
      check(
        yellowShot[0] === 255 && yellowShot[1] === 255 && yellowShot[2] === 0,
        `${preference}: drawing target order is wrong`,
      )
      check(
        greenShot[0] === 0 && greenShot[1] === 255 && greenShot[2] === 0,
        `${preference}: overlay target order is wrong`,
      )
      check(redShot[0] === 255 && redShot[1] === 0, `${preference}: main content disappeared`)
      results.push({
        backend: preference,
        dpr,
        mainZ: main.style.zIndex,
        drawingZ: drawing.style.zIndex,
        overlayZ: overlay.style.zIndex,
      })
    }
    return results
  } finally {
    await chart.destroy()
    mounted.cleanup()
    root.remove()
  }
}
