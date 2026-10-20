/** 三后端共用单一原语契约，不再允许第二条可见 GPU 输出链路。 */
import { describe, expect, it } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createCanvas2DRenderer } from '../backend/createCanvas2DRenderer'

describe('unified Renderer contract', () => {
  it('exposes only backend identity, primitive execution and disposal', () => {
    const renderer = createCanvas2DRenderer()
    expect(Object.keys(renderer).sort()).toEqual(['caps', 'dispose', 'primitives'])
    const target = createMockCanvasContext()
    expect(
      renderer.primitives.paint(
        target,
        [{ kind: 'rect', x: 1, y: 2, width: 3, height: 4, color: 'red' }],
        1,
      ),
    ).toBe(true)
    expect(target.fillRect).toHaveBeenCalledWith(1, 2, 3, 4)
    renderer.dispose()
    expect(renderer.primitives.paint(target, [], 1)).toBe(false)
  })
})
