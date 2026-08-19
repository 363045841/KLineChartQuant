/** 验证帧指标的重置、记录和快照行为。 */

import { describe, expect, it } from 'vitest'

import { createFrameMetrics, getFrameMetrics, resetFrameMetrics } from '../frameMetrics'

describe('frameMetrics', () => {
  it('counts submits uploads and buffer creates per frame', () => {
    resetFrameMetrics()
    const m = createFrameMetrics()
    m.beginFrame()
    m.recordBufferCreate()
    m.recordUpload(64)
    m.recordDraw()
    m.recordSubmit()
    m.recordComposite()
    m.endFrame()
    expect(getFrameMetrics()).toMatchObject({
      bufferCreateCount: 1,
      bufferUploadBytes: 64,
      drawCallCount: 1,
      queueSubmitCount: 1,
      compositeCount: 1,
    })
  })
})
