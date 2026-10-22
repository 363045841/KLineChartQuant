/** Canvas 原语后端：矩形批次的视口剔除与数据空间填充的 Path2D 缓存。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { paintCanvasPrimitives } from '../impl/canvas.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Canvas 原语后端', () => {
  it('逐矩形剔除视口外的柱体', () => {
    const ctx = createMockCanvasContext()
    const data = new Float64Array([
      10, 10, 5, 5, 800, 10, 5, 5, -20, 10, 5, 5, 900, 10, 5, 5, 10, 900, 5, 5,
    ])
    paintCanvasPrimitives(ctx, [{ kind: 'rects', data, color: 'red' }], 1)
    // 贴右边界的 x=800 仍然绘制，完全在视口外的三根跳过。
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 10, 10, 5, 5)
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 800, 10, 5, 5)
  })

  it('数据空间填充复用 Path2D，滚动只改变换矩阵', () => {
    const built: FakePath[] = []
    class FakePath {
      readonly points: Array<readonly [number, number]> = []
      constructor() {
        built.push(this)
      }
      moveTo(x: number, y: number) {
        this.points.push([x, y])
      }
      lineTo(x: number, y: number) {
        this.points.push([x, y])
      }
      closePath() {}
    }
    vi.stubGlobal('Path2D', FakePath)
    const ctx = createMockCanvasContext()
    const paths = [
      [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
      ],
    ]
    const fill = { kind: 'fill', paths, band: true, dataSpace: true, color: 'red' } as const
    paintCanvasPrimitives(ctx, [fill], 1, { offsetX: 0, yScale: 1, yOffset: 0 })
    paintCanvasPrimitives(ctx, [fill], 1, { offsetX: 3, yScale: 2, yOffset: 5 })

    expect(built).toHaveLength(1)
    expect(built[0]!.points).toHaveLength(4)
    const calls = vi.mocked(ctx.fill).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]![0]).toBe(calls[1]![0])
    expect(ctx.translate).toHaveBeenCalledWith(-3, 5)
    expect(ctx.scale).toHaveBeenCalledWith(1, 2)
  })
})
