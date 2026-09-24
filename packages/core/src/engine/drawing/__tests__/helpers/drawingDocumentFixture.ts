import { createDrawingState } from '@/engine/state/drawingState.js'
import { DrawingCommands } from '../../model/impl/DrawingCommands.js'
import { DrawingDocument } from '../../model/impl/DrawingDocument.js'

export function createDrawingDocumentFixture() {
  const state = createDrawingState()
  const timestamps = [0, 250, 500, 750, 1_000]
  const document = new DrawingDocument({
    drawingState: state,
    getLogicalIndexAtTimestamp: (timestamp) => {
      const index = timestamps.indexOf(timestamp)
      return index === -1 ? null : index
    },
    getDrawingTimestampAtLogicalIndex: (index) => timestamps[index] ?? null,
    getDrawingData: () => timestamps.map((timestamp) => ({ timestamp })),
    findAnchorAtTradingDate: (tradingDate) =>
      tradingDate === '2026-04-10'
        ? { kind: 'resolved' as const, timestamp: 1_000 }
        : { kind: 'not-trading' as const },
    hasPaneId: (paneId) => paneId === 'main',
    getWorkspaceId: () => 'kline',
  })
  return { state, document }
}

export function createDrawingCommandsFixture(requestDraw: () => void = () => {}) {
  const { state, document } = createDrawingDocumentFixture()
  const commands = new DrawingCommands({ document, requestDraw })
  return { state, document, commands }
}
