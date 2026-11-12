import { createDrawingState } from '@/engine/state/drawingState.js'
import { DrawingCommands } from '../../model/impl/DrawingCommands.js'
import { DrawingDocument } from '../../model/impl/DrawingDocument.js'

export function createDrawingDocumentFixture(
  getSymbolKey: () => string | undefined = () => undefined,
) {
  const state = createDrawingState()
  const document = new DrawingDocument({
    drawingState: state,
    findAnchorAtTradingDate: (tradingDate) =>
      tradingDate === '2026-04-10'
        ? { kind: 'resolved' as const, timestamp: 1_000 }
        : { kind: 'not-trading' as const },
    hasPaneId: (paneId) => paneId === 'main',
    getWorkspaceId: () => 'kline',
    getSymbolKey,
    // 通道类图元的派生锚点按价格空间换算；测试统一用线性价格空间。
    getPriceSpace: () => 'price',
  })
  return { state, document }
}

export function createDrawingCommandsFixture(requestDraw: () => void = () => {}) {
  const { state, document } = createDrawingDocumentFixture()
  const commands = new DrawingCommands({ document, requestDraw })
  return { state, document, commands }
}
