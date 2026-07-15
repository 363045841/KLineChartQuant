import { describe, expect, it, vi } from 'vitest'

import { ChartStateKernel } from '../chartStateKernel'
import { createSubPaneState } from '../subPaneState'

describe('subPaneState', () => {
  it('publishes immutable entry snapshots and copies action inputs', () => {
    const state = createSubPaneState()
    const params = { period1: 6 }

    state.actions.upsert({ paneId: 'RSI_0', indicatorId: 'RSI', params })
    params.period1 = 99

    const entry = state.readonly.entries.peek()[0]!
    expect(entry.params).toEqual({ period1: 6 })
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry.params)).toBe(true)
    expect(() => {
      ;(entry.params as Record<string, unknown>).period1 = 12
    }).toThrow()
  })

  it('does not publish a new snapshot for an identical upsert', () => {
    const state = createSubPaneState()
    const listener = vi.fn()
    state.readonly.entries.subscribe(listener)

    state.actions.upsert({ paneId: 'RSI_0', indicatorId: 'RSI', params: { period1: 6 } })
    state.actions.upsert({ paneId: 'RSI_0', indicatorId: 'RSI', params: { period1: 6 } })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('deeply snapshots nested parameter arrays and objects', () => {
    const state = createSubPaneState()
    const params = { levels: [20, 80], style: { width: 2 } }

    state.actions.upsert({ paneId: 'RSI_0', indicatorId: 'RSI', params })
    params.levels[0] = 10
    params.style.width = 4

    const stored = state.readonly.entries.peek()[0]!.params as typeof params
    expect(stored).toEqual({ levels: [20, 80], style: { width: 2 } })
    expect(Object.isFrozen(stored.levels)).toBe(true)
    expect(Object.isFrozen(stored.style)).toBe(true)
  })

  it('rejects mutable non-plain parameter objects', () => {
    const state = createSubPaneState()

    expect(() =>
      state.actions.upsert({
        paneId: 'RSI_0',
        indicatorId: 'RSI',
        params: { dates: new Map([['start', new Date()]]) },
      }),
    ).toThrow(TypeError)
    expect(state.readonly.entries.peek()).toEqual([])
  })

  it('rejects bigint and symbol parameter values', () => {
    const state = createSubPaneState()

    expect(() =>
      state.actions.upsert({
        paneId: 'RSI_0',
        indicatorId: 'RSI',
        params: { value: 1n },
      }),
    ).toThrow(TypeError)
    expect(() =>
      state.actions.upsert({
        paneId: 'RSI_0',
        indicatorId: 'RSI',
        params: { value: Symbol('x') },
      }),
    ).toThrow(TypeError)
  })

  it('replace rewrites even when params are equal', () => {
    const state = createSubPaneState()
    state.actions.upsert({ paneId: 'RSI_0', indicatorId: 'RSI', params: { period1: 6 } })
    const first = state.readonly.entries.peek()

    state.actions.replace({ paneId: 'RSI_0', indicatorId: 'RSI', params: { period1: 6 } })

    expect(state.readonly.entries.peek()).not.toBe(first)
    expect(state.readonly.entries.peek()[0]).toEqual({
      paneId: 'RSI_0',
      indicatorId: 'RSI',
      params: { period1: 6 },
    })
  })
})

describe('ChartStateKernel sub-pane transactions', () => {
  function createKernel() {
    return new ChartStateKernel({
      initialOptions: {
        minKWidth: 3,
        maxKWidth: 20,
        zoomLevelCount: 10,
        bottomAxisHeight: 24,
        rightAxisWidth: 60,
        leftAxisWidth: 0,
        yPaddingPx: 4,
        panes: [{ id: 'main', ratio: 1, visible: true, role: 'price' }],
      },
      initialZoomLevel: 0,
      scheduleDraw: () => {},
    })
  }

  it('publishes pane layout and sub-pane entry as one complete snapshot', () => {
    const kernel = createKernel()
    const snapshots: Array<{ paneIds: string[]; entryIds: string[] }> = []
    const capture = () => {
      snapshots.push({
        paneIds: kernel.pane.readonly.paneSpecs.peek().map((pane) => pane.id),
        entryIds: kernel.subPane.readonly.entries.peek().map((entry) => entry.paneId),
      })
    }
    kernel.pane.readonly.paneSpecs.subscribe(capture)
    kernel.subPane.readonly.entries.subscribe(capture)

    kernel.actions.createSubPane('RSI_0', 'RSI', { period1: 6 })

    expect(snapshots.length).toBeGreaterThan(0)
    expect(snapshots).toEqual(
      snapshots.map(() => ({ paneIds: ['main', 'RSI_0'], entryIds: ['RSI_0'] })),
    )
    expect(kernel.pane.readonly.paneRatios.peek()).toEqual({ main: 0.75, RSI_0: 0.25 })
  })

  it('removes pane layout and sub-pane entry atomically', () => {
    const kernel = createKernel()
    kernel.actions.createSubPane('RSI_0', 'RSI', { period1: 6 })
    const snapshots: Array<{ paneIds: string[]; entryIds: string[] }> = []
    const capture = () => {
      snapshots.push({
        paneIds: kernel.pane.readonly.paneSpecs.peek().map((pane) => pane.id),
        entryIds: kernel.subPane.readonly.entries.peek().map((entry) => entry.paneId),
      })
    }
    kernel.pane.readonly.paneSpecs.subscribe(capture)
    kernel.subPane.readonly.entries.subscribe(capture)

    kernel.actions.removeSubPane('RSI_0')

    expect(snapshots).toEqual(snapshots.map(() => ({ paneIds: ['main'], entryIds: [] })))
  })
})
