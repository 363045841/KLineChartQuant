import { describe, expect, it } from 'vitest'
import { createDrawingState } from '@/engine/state/drawingState'
import { createTrendLine } from '../../__tests__/helpers/drawingTestKit'
import { PREVIEW_ID } from '../../session/impl/DrawingSessionOverlay'
import type { DrawingObject } from '../../types'
import { DrawingStore } from '../impl/DrawingStore'

describe('DrawingStore projection', () => {
  const scope = (workspaceId: 'kline' | 'timeshare' = 'kline', period = 'daily') => ({
    paneId: 'main',
    workspaceId,
    symbolKey: undefined,
    period,
  })

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
    expect(store.getVisibleByPane(scope()).map((d) => d.id)).toEqual(['a'])

    state.actions.setDrawings([
      { ...createTrendLine('kline'), workspaceId: 'kline' },
      { ...createTrendLine('timeshare'), workspaceId: 'timeshare' },
    ])
    expect(store.getVisibleByPane(scope()).map((d) => d.id)).toEqual(['kline'])
    expect(store.getVisibleByPane(scope('timeshare')).map((d) => d.id)).toEqual(['timeshare'])

    state.actions.setDrawings([createTrendLine('c')])
    expect(store.getAll().map((d) => d.id)).toEqual(['c'])
    expect(store.getSelectedIds()).toEqual([])
  })

  it('separates indicator drawings from user drawings for different paint targets', () => {
    const state = createDrawingState()
    state.actions.setDrawings([createTrendLine('user')])
    const store = new DrawingStore({
      drawings$: state.readonly.drawings,
      selectedDrawingIds$: state.readonly.selectedDrawingIds,
      getIndicatorDrawings: () => [createTrendLine('indicator')],
    })

    expect(store.getVisibleByPane(scope(), 'committed', 'user').map((d) => d.id)).toEqual(['user'])
    expect(store.getVisibleByPane(scope(), 'committed', 'indicator').map((d) => d.id)).toEqual([
      'indicator',
    ])
    expect(
      store
        .getVisibleByPane(scope(), 'committed', 'all')
        .map((d) => d.id)
        .sort(),
    ).toEqual(['indicator', 'user'])
  })

  it('filters drawings by the stored timeframe rule', () => {
    const state = createDrawingState()
    state.actions.setDrawings([
      createTrendLine('above', { timeframeVisibility: { mode: 'above', period: '60min' } }),
    ])
    const store = new DrawingStore({
      drawings$: state.readonly.drawings,
      selectedDrawingIds$: state.readonly.selectedDrawingIds,
    })

    expect(store.getVisibleByPane(scope('kline', 'daily')).map((d) => d.id)).toEqual(['above'])
    expect(store.getVisibleByPane(scope('kline', '5min'))).toEqual([])
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
