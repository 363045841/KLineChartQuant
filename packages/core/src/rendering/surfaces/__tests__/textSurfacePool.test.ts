/** 验证文字网格的 DPR、跨格重放、Pane 定位、复用与像素释放。 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import type { TextPaintPrimitive } from '@/rendering/primitives/types'
import { TextSurfacePool } from '../impl/textSurfacePool'

afterEach(() => vi.restoreAllMocks())

/** 真实 DOM 维护尺寸，Canvas 替身只提供字体度量与重放观察。 */
function fixture() {
  const ctx = createMockCanvasContext()
  vi.mocked(ctx.measureText).mockReturnValue({
    ...ctx.measureText(''),
    width: 30,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: 30,
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  const host = document.createElement('div')
  const anchor = document.createElement('canvas')
  host.appendChild(anchor)
  const pool = new TextSurfacePool(anchor)
  const text: TextPaintPrimitive = {
    kind: 'text',
    text: 'price',
    x: 250,
    y: 40,
    font: '12px sans-serif',
    color: '#fff',
    align: 'left',
    baseline: 'alphabetic',
  }
  return { ctx, host, anchor, pool, text }
}

describe('TextSurfacePool', () => {
  it('replays crossing glyphs in both tiles with local coordinates and preserves pane top', () => {
    const { ctx, host, pool, text } = fixture()
    pool.paint([text], 1, { width: 800, height: 200 }, 350)
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('canvas.text-tile')]
    expect(tiles).toHaveLength(2)
    expect(tiles.map((tile) => tile.style.left).sort()).toEqual(['0px', '256px'])
    expect(tiles.map((tile) => tile.style.top)).toEqual(['350px', '350px'])
    expect(ctx.fillText).toHaveBeenCalledWith('price', 250, 40)
    expect(ctx.fillText).toHaveBeenCalledWith('price', -6, 40)
  })

  it.each([1.25, 1.5, 2])('uses physical tile dimensions and reuses surfaces at DPR %s', (dpr) => {
    const { host, pool, text } = fixture()
    pool.paint([{ ...text, x: 20 }], dpr, { width: 800, height: 200 }, 30)
    const tile = host.querySelector<HTMLCanvasElement>('canvas.text-tile')
    expect(tile?.width).toBe(256)
    expect(tile?.style.width).toBe(`${256 / dpr}px`)
    pool.paint([{ ...text, x: 40 }], dpr, { width: 800, height: 200 }, 60)
    expect(host.querySelector('canvas.text-tile')).toBe(tile)
    expect(tile?.style.top).toBe('60px')
    pool.paint([], dpr, { width: 800, height: 200 }, 60)
    expect(host.querySelector('canvas.text-tile')).toBeNull()
    expect(tile?.width).toBe(0)
    expect(tile?.height).toBe(0)
  })

  it('clips off-pane text before allocation and releases all pixels on clear', () => {
    const { host, pool, text } = fixture()
    pool.paint([{ ...text, x: 900 }], 1, { width: 800, height: 200 }, 0)
    expect(host.querySelector('canvas.text-tile')).toBeNull()
    pool.paint([text], 1, { width: 800, height: 200 }, 0)
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('canvas.text-tile')]
    pool.clear()
    pool.clear()
    expect(host.querySelector('canvas.text-tile')).toBeNull()
    expect(tiles.every((tile) => tile.width === 0 && tile.height === 0)).toBe(true)
  })
})
