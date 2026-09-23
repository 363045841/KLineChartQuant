/** 验证绘图命令原语在成功写入后统一请求重绘。 */
import { describe, expect, it, vi } from 'vitest'

import { createDrawingCommandsFixture } from '../../__tests__/helpers/drawingDocumentFixture'

/** 创建带重绘探针的绘图命令夹具。 */
function createFixture() {
  const requestDraw = vi.fn()
  return { ...createDrawingCommandsFixture(requestDraw), requestDraw }
}

describe('DrawingCommands', () => {
  it('requests one draw for every successful committed mutation', () => {
    const { commands, requestDraw } = createFixture()
    const drawing = commands.create({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 9 }],
    })

    commands.update({ ...drawing, style: { ...drawing.style, strokeWidth: 2 } })
    commands.updateBatch([drawing.id], { style: { stroke: '#f00' } })
    commands.removeBatch([drawing.id])
    commands.clear()
    commands.syncExternalDrawings([])

    expect(requestDraw).toHaveBeenCalledTimes(5)
  })

  it('does not request a draw when update or remove changes nothing', () => {
    const { commands, requestDraw } = createFixture()

    expect(
      commands.update({
        id: 'missing',
        kind: 'horizontal-line',
        paneId: 'main',
        visible: false,
        anchors: [],
        labels: { line: {}, area: {} },
        params: {},
        style: {},
      }),
    ).toBeNull()
    expect(commands.updateBatch(['missing'], { visible: false })).toEqual([])
    expect(commands.remove('missing')).toBe(false)
    expect(commands.removeBatch(['missing'])).toBe(false)
    expect(requestDraw).not.toHaveBeenCalled()
  })
})
