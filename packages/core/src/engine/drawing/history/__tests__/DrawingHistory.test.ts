import { describe, expect, it, vi } from 'vitest'
import { createDrawingCommandsFixture } from '../../__tests__/helpers/drawingDocumentFixture'

function fixture() {
  const requestDraw = vi.fn()
  return { ...createDrawingCommandsFixture(requestDraw), requestDraw }
}

function addLine(commands: ReturnType<typeof fixture>['commands'], price = 10) {
  return commands.create({ kind: 'horizontal-line', paneId: 'main', anchors: [{ price }] })
}

describe('drawing history', () => {
  it('restores IDs, order and selection across create, delete, undo and redo', () => {
    const { commands, document, state } = fixture()
    const first = addLine(commands)
    const second = addLine(commands, 20)
    expect(commands.remove(first.id)).toBe(true)
    expect(document.listDrawings().map((drawing) => drawing.id)).toEqual([second.id])
    expect(commands.history.undo()).toBe(true)
    expect(document.listDrawings().map((drawing) => drawing.id)).toEqual([first.id, second.id])
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([second.id])
    expect(commands.history.undo()).toBe(true)
    expect(state.readonly.selectedDrawingIds.peek()).toEqual([first.id])
    expect(commands.history.redo()).toBe(true)
    expect(document.getDrawing(second.id)?.anchors).toEqual(second.anchors)
  })

  it('treats a batch edit and drag as one step and restores a locked drawing', () => {
    const { commands, document } = fixture()
    const a = addLine(commands)
    const b = addLine(commands, 20)
    commands.updateBatch([a.id, b.id], { locked: true, style: { strokeWidth: 3 } })
    expect(commands.history.undo()).toBe(true)
    expect(document.listDrawings().map((drawing) => drawing.style.strokeWidth)).toEqual([1, 1])
    expect(commands.history.redo()).toBe(true)
    expect(document.listDrawings().every((drawing) => drawing.locked)).toBe(true)
    commands.updateBatch([a.id, b.id], { locked: false })
    commands.commitDrags([
      { id: a.id, anchors: [{ ...a.anchors[0]!, price: 30 }] },
      { id: b.id, anchors: [{ ...b.anchors[0]!, price: 40 }] },
    ])
    expect(commands.history.undo()).toBe(true)
    expect(document.listDrawings().map((drawing) => drawing.anchors[0]?.price)).toEqual([10, 20])
  })

  it('does not record no-ops and invalidates redo on the next real edit', () => {
    const { commands, document } = fixture()
    const a = addLine(commands)
    expect(commands.update({ ...a })).not.toBeNull()
    expect(commands.history.undo()).toBe(true)
    expect(commands.history.canRedo.peek()).toBe(true)
    expect(commands.remove('unknown')).toBe(false)
    expect(commands.history.canRedo.peek()).toBe(true)
    addLine(commands, 30)
    expect(commands.history.canRedo.peek()).toBe(false)
    expect(document.getDrawing(a.id)).toBeNull()
  })

  it('keeps import undoable but resets the baseline for external writes', () => {
    const { commands, document, state } = fixture()
    const a = addLine(commands)
    commands.importDrawings([])
    expect(commands.history.undo()).toBe(true)
    expect(document.getDrawing(a.id)).not.toBeNull()
    commands.syncExternalDrawings([])
    expect(commands.history.canUndo.peek()).toBe(false)
    expect(commands.history.undo()).toBe(false)
    addLine(commands)
    state.actions.clearDrawings()
    expect(commands.history.canUndo.peek()).toBe(false)
  })

  it('does not record a failed locked drag or an empty clear', () => {
    const { commands, document, requestDraw } = fixture()
    commands.clear()
    expect(requestDraw).not.toHaveBeenCalled()
    const a = addLine(commands)
    commands.updateBatch([a.id], { locked: true })
    const count = requestDraw.mock.calls.length
    expect(commands.commitDrag(a.id, [{ ...a.anchors[0]!, price: 99 }])).toBeNull()
    expect(requestDraw).toHaveBeenCalledTimes(count)
    expect(commands.history.undo()).toBe(true)
    expect(document.getDrawing(a.id)?.locked).toBeUndefined()
  })
})
