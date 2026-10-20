/** 公共提交回归：整批回退只执行一次，成功批次不再重复 Canvas 绘制。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { primitiveSink } from '../impl/paint.js'
import type { PaintPrimitive, PrimitiveBackend } from '../types.js'

describe('primitive submission', () => {
  it.each([true, false])('handles GPU result %s without duplicate drawing', (success) => {
    const target = createMockCanvasContext()
    const commands: PaintPrimitive[] = [
      { kind: 'rect', x: 10, y: 10, width: 20, height: 20, color: 'red' },
      { kind: 'circle', x: 40, y: 40, radius: 5, color: 'blue' },
    ]
    const paint = vi.fn(() => success)
    const backend: PrimitiveBackend = { paint, dispose() {} }
    primitiveSink(backend)(target, commands, 1.25)
    expect(paint).toHaveBeenCalledExactlyOnceWith(target, commands, 1.25)
    expect(target.fillRect).toHaveBeenCalledTimes(success ? 0 : 1)
    expect(target.arc).toHaveBeenCalledTimes(success ? 0 : 1)
  })
})
