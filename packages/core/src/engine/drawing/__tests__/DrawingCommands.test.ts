/** 验证绘图命令原语在成功写入后统一请求重绘。 */
import { describe, expect, it, vi } from 'vitest'

import { createDrawingState } from '../../state/drawingState'
import { DrawingCommands } from '../DrawingCommands'
import { DrawingDocument } from '../DrawingDocument'

/** 创建带重绘探针的绘图命令夹具。 */
function createFixture() {
  const document = new DrawingDocument({
    drawingState: createDrawingState(),
    getLogicalIndexAtTimestamp: () => 0,
    findAnchorAtTradingDate: () => ({ timestamp: 1_000 }),
    hasPaneId: (paneId) => paneId === 'main',
  })
  const requestDraw = vi.fn()
  return { commands: new DrawingCommands({ document, requestDraw }), requestDraw }
}

describe('DrawingCommands', () => {
  it('requests one draw for every successful committed mutation', () => {
    const { commands, requestDraw } = createFixture()
    const drawing = commands.create({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 9 }],
    })

    commands.update(drawing.id, { style: { strokeWidth: 2 } })
    commands.updateBatch([drawing.id], { style: { stroke: '#f00' } })
    commands.removeBatch([drawing.id])
    commands.clear()
    commands.replace([])

    expect(requestDraw).toHaveBeenCalledTimes(6)
  })

  it('does not request a draw when update or remove changes nothing', () => {
    const { commands, requestDraw } = createFixture()

    expect(commands.update('missing', { visible: false })).toBeNull()
    expect(commands.updateBatch(['missing'], { visible: false })).toEqual([])
    expect(commands.remove('missing')).toBe(false)
    expect(commands.removeBatch(['missing'])).toBe(false)
    expect(requestDraw).not.toHaveBeenCalled()
  })
})
