import { createDrawingState } from '@/engine/state/drawingState.js'
import { DrawingCommands } from '../../model/impl/DrawingCommands.js'
import { DrawingDocument } from '../../model/impl/DrawingDocument.js'

export function createDrawingDocumentFixture(
  getSymbolKey: () => string | undefined = () => undefined,
) {
  const state = createDrawingState()
  const document = new DrawingDocument({
    drawingState: state,
    hasPaneId: (paneId) => paneId === 'main',
    getWorkspaceId: () => 'kline',
    getSymbolKey,
  })
  return { state, document }
}

export function createDrawingCommandsFixture(requestDraw: () => void = () => {}) {
  const { state, document } = createDrawingDocumentFixture()
  const commands = new DrawingCommands({ document, requestDraw })
  return { state, document, commands }
}
