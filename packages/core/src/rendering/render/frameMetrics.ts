export type FrameMetricsSnapshot = {
  bufferCreateCount: number
  bufferUploadBytes: number
  drawCallCount: number
  queueSubmitCount: number
  compositeCount: number
}

function empty(): FrameMetricsSnapshot {
  return {
    bufferCreateCount: 0,
    bufferUploadBytes: 0,
    drawCallCount: 0,
    queueSubmitCount: 0,
    compositeCount: 0,
  }
}

let snapshot: FrameMetricsSnapshot = empty()

export function resetFrameMetrics(): void {
  snapshot = empty()
}

export function getFrameMetrics(): FrameMetricsSnapshot {
  return { ...snapshot }
}

export function createFrameMetrics() {
  let current = empty()
  return {
    beginFrame(): void {
      current = empty()
    },
    recordBufferCreate(): void {
      current.bufferCreateCount += 1
    },
    recordUpload(bytes: number): void {
      current.bufferUploadBytes += bytes
    },
    recordDraw(): void {
      current.drawCallCount += 1
    },
    recordSubmit(): void {
      current.queueSubmitCount += 1
    },
    recordComposite(): void {
      current.compositeCount += 1
    },
    endFrame(): void {
      snapshot = { ...current }
    },
  }
}
