import { describe, it, expect, vi } from 'vitest'

import { fillCloud, type CloudSeg } from '../ichimoku'

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 0,
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D
}

describe('fillCloud', () => {
  it('should include the bottom point of the last segment in the fill polygon', () => {
    const ctx = createMockCtx()
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
