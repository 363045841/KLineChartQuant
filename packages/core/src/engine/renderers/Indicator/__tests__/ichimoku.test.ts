import { describe, expect, it } from 'vitest'

import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'

import { type CloudSeg, fillCloud } from '../ichimoku'

describe('fillCloud', () => {
  it('should include the bottom point of the last segment in the fill polygon', () => {
    const ctx = createMockCanvasContext()
    const segs: CloudSeg[] = [
      { x: 0, ya: 100, yb: 50, bull: true },
      { x: 1, ya: 95, yb: 55, bull: true },
      { x: 2, ya: 90, yb: 60, bull: true },
    ]

    fillCloud(ctx, segs, 'green', 'red', 0.15)

    // 底部回描最后一个 segment 时，必须包含 segs[2] 的 (x, yb)
    // 当前 bug：底部只回描到 end（segs[1]），跳过 segs[2] 的底边
    expect(ctx.lineTo).toHaveBeenCalledWith(segs[2]!.x, segs[2]!.yb)
  })
})
