/** Canvas 生命周期与显式原语目标回归。 */
import { expect, it } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createCanvas2DRenderer } from '../backend/createCanvas2DRenderer'

it('writes only to the provided target and stops after disposal', () => {
  const renderer = createCanvas2DRenderer(),
    target = createMockCanvasContext(),
    other = createMockCanvasContext()
  renderer.primitives.paint(target, [{ kind: 'circle', x: 10, y: 20, radius: 4, color: 'red' }], 1)
  expect(target.arc).toHaveBeenCalledOnce()
  expect(other.arc).not.toHaveBeenCalled()
  renderer.dispose()
  renderer.dispose()
  expect(renderer.primitives.paint(other, [], 1)).toBe(false)
})
