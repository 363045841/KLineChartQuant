/** 指标结果 Kernel 状态测试。 */
import { describe, expect, it, vi } from 'vitest'

import type { IndicatorSeriesBundle } from '../../indicators/workerProtocol'
import { createIndicatorResultState } from '../indicatorResultState'

/** 创建满足状态边界测试的最小结果包。 */
function bundle(): IndicatorSeriesBundle {
  return { _changed: ['ma'] } as unknown as IndicatorSeriesBundle
}

const input = { requestId: 1, dataVersion: 7, configVersion: 3 }

describe('indicatorResultState', () => {
  it('atomically publishes attempt and committed result', () => {
    const state = createIndicatorResultState()
    const listener = vi.fn()
    state.readonly.snapshot.subscribe(listener)
    const renderStates = new Map([['indicator:ma:main', { series: { 5: [1, 2, 3] } }]])

    state.actions.beginCalculation(input)
    expect(
      state.actions.commitResults({ ...input, bundle: bundle(), renderStates }),
    ).toBe(true)

    const snapshot = state.readonly.snapshot.peek()
    expect(snapshot.attempt.status).toBe('idle')
    expect(snapshot.committed).toMatchObject({
      dataVersion: 7,
      configVersion: 3,
      resultVersion: 1,
      projectionVersion: 1,
    })
    expect(snapshot.committed?.renderStates.get('indicator:ma:main')).toEqual(
      renderStates.get('indicator:ma:main'),
    )
    expect(() =>
      (snapshot.committed?.renderStates as Map<string, unknown>).set('x', {}),
    ).toThrow(TypeError)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('rejects a stale commit and preserves the active attempt', () => {
    const state = createIndicatorResultState()
    state.actions.beginCalculation(input)

    expect(
      state.actions.commitResults({
        requestId: 0,
        dataVersion: input.dataVersion,
        configVersion: input.configVersion,
        bundle: bundle(),
        renderStates: new Map(),
      }),
    ).toBe(false)
    expect(state.readonly.snapshot.peek().attempt.status).toBe('computing')
    expect(state.readonly.snapshot.peek().committed).toBeNull()
  })

  it('updates projection without advancing the result version', () => {
    const state = createIndicatorResultState()
    state.actions.beginCalculation(input)
    state.actions.commitResults({ ...input, bundle: bundle(), renderStates: new Map() })

    expect(
      state.actions.updateProjection({
        resultVersion: 1,
        renderStates: new Map([['indicator:ma:main', { visibleMin: 2 }]]),
      }),
    ).toBe(true)

    const committed = state.readonly.snapshot.peek().committed!
    expect(committed.resultVersion).toBe(1)
    expect(committed.projectionVersion).toBe(2)
    expect(committed.renderStates.get('indicator:ma:main')).toEqual({ visibleMin: 2 })
  })

  it('retains the last committed result when a later calculation fails', () => {
    const state = createIndicatorResultState()
    const result = bundle()
    state.actions.beginCalculation(input)
    state.actions.commitResults({ ...input, bundle: result, renderStates: new Map() })
    state.actions.beginCalculation({ requestId: 2, dataVersion: 8, configVersion: 4 })

    expect(
      state.actions.failCalculation({
        requestId: 2,
        dataVersion: 8,
        configVersion: 4,
        error: 'worker unavailable',
      }),
    ).toBe(true)

    const snapshot = state.readonly.snapshot.peek()
    expect(snapshot.attempt).toMatchObject({ status: 'error', dataVersion: 8, configVersion: 4 })
    expect(snapshot.committed).toMatchObject({
      dataVersion: 7,
      configVersion: 3,
      resultVersion: 1,
      bundle: result,
    })
  })

  it('rejects a stale failure without replacing the current attempt', () => {
    const state = createIndicatorResultState()
    state.actions.beginCalculation({ requestId: 1, dataVersion: 7, configVersion: 3 })
    state.actions.beginCalculation({ requestId: 2, dataVersion: 8, configVersion: 4 })

    expect(
      state.actions.failCalculation({
        requestId: 1,
        dataVersion: 7,
        configVersion: 3,
        error: 'late worker error',
      }),
    ).toBe(false)
    expect(state.readonly.snapshot.peek().attempt).toMatchObject({
      status: 'computing',
      requestId: 2,
    })
  })
})
