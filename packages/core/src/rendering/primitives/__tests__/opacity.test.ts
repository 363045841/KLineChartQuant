/** 验证新迁移的足迹矩形和文字透明度在公共后端中保持独立。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import { paintCanvasPrimitives } from '../impl/canvas'
import { createPrimitivePreparer } from '../impl/prepare'

describe('primitive opacity', () => {
  it('multiplies GPU rectangle alpha without changing RGB or cached colors', () => {
    const prepare = createPrimitivePreparer(() => [1, 0.5, 0.25, 0.8])
    const batch = prepare.prepare(
      [
        { kind: 'rect', x: 10, y: 10, width: 20, height: 20, color: '#fff', opacity: 0.5 },
        { kind: 'rect', x: 40, y: 10, width: 20, height: 20, color: '#fff' },
      ],
      100,
      100,
      1,
    )
    expect([...batch.instances.slice(8, 11)]).toEqual([1, 0.5, 0.25])
    expect(batch.instances[11]).toBeCloseTo(0.4)
    expect(batch.instances[27]).toBeCloseTo(0.8)
  })

  it('restores base Canvas alpha between translucent text, rectangles and circles', () => {
    const ctx = createMockCanvasContext()
    ctx.globalAlpha = 0.8
    const observed: number[] = []
    vi.mocked(ctx.fillText).mockImplementation(() => {
      observed.push(ctx.globalAlpha)
    })
    vi.mocked(ctx.fillRect).mockImplementation(() => {
      observed.push(ctx.globalAlpha)
    })
    vi.mocked(ctx.fill).mockImplementation(() => {
      observed.push(ctx.globalAlpha)
    })
    paintCanvasPrimitives(
      ctx,
      [
        {
          kind: 'text',
          text: 'delta',
          x: 20,
          y: 20,
          font: '12px sans-serif',
          color: '#fff',
          align: 'left',
          baseline: 'top',
          opacity: 0.5,
        },
        { kind: 'rect', x: 20, y: 30, width: 10, height: 10, color: '#fff', opacity: 0.25 },
        { kind: 'circle', x: 40, y: 40, radius: 3, color: '#fff' },
      ],
      1,
    )
    expect(observed).toEqual([0.4, 0.2, 0.8])
  })
})
