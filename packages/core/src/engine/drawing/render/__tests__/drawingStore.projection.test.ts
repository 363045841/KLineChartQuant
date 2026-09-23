import { describe, expect, it } from 'vitest'
import { createDrawingState } from '../../../state/drawingState'
import { createTrendLine } from '../../__tests__/helpers/drawingTestKit'
import { PREVIEW_ID } from '../../session/impl/DrawingState'
import type { DrawingObject } from '../../types'
import { DrawingStore } from '../impl/DrawingStore'

describe('DrawingStore projection', () => {
  it('reads drawings and selection from injected signals', () => {
    const state = createDrawingState()
    state.actions.setDrawings([createTrendLine('a'), createTrendLine('b', { paneId: 'sub' })])
    state.actions.setSelectedDrawingIds(['a'])

    const store = new DrawingStore({
      drawings$: state.readonly.drawings,
      selectedDrawingIds$: state.readonly.selectedDrawingIds,
    })

    expect(store.getAll().map((d) => d.id)).toEqual(['a', 'b'])
    expect(store.getSelectedIds()).toEqual(['a'])
    expect(store.getVisibleByPane('main', 'kline').map((d) => d.id)).toEqual(['a'])

    state.actions.setDrawings([
      { ...createTrendLine('kline'), workspaceId: 'kline' },
      { ...createTrendLine('timeshare'), workspaceId: 'timeshare' },
    ])
    expect(store.getVisibleByPane('main', 'kline').map((d) => d.id)).toEqual(['kline'])
    expect(store.getVisibleByPane('main', 'timeshare').map((d) => d.id)).toEqual(['timeshare'])

    state.actions.setDrawings([createTrendLine('c')])
    expect(store.getAll().map((d) => d.id)).toEqual(['c'])
    expect(store.getSelectedIds()).toEqual([])
  })

  it('merges session overlay for paint without changing kernel signal', () => {
    const state = createDrawingState()
    state.actions.setDrawings([createTrendLine('a')])
    let overlay: DrawingObject[] = []

    const store = new DrawingStore({
      drawings$: state.readonly.drawings,
      selectedDrawingIds$: state.readonly.selectedDrawingIds,
      getOverlay: () => overlay,
    })

    overlay = [{ ...createTrendLine(PREVIEW_ID), id: PREVIEW_ID }]
    expect(store.getAll().map((d) => d.id)).toEqual(['a', PREVIEW_ID])
    expect(state.readonly.drawings.peek().map((d) => d.id)).toEqual(['a'])

    const moved = { ...createTrendLine('a'), style: { stroke: '#0f0' } }
    overlay = [moved]
    expect(store.getAll()).toHaveLength(1)
    expect(store.getAll()[0]!.style.stroke).toBe('#0f0')
  })
})
