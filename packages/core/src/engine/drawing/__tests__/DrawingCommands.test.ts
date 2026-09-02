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
    commands.remove(drawing.id)
    commands.clear()
    commands.replace([])

    expect(requestDraw).toHaveBeenCalledTimes(5)
  })

  it('does not request a draw when update or remove changes nothing', () => {
    const { commands, requestDraw } = createFixture()

    expect(commands.update('missing', { visible: false })).toBeNull()
    expect(commands.remove('missing')).toBe(false)
    expect(requestDraw).not.toHaveBeenCalled()
  })
})
