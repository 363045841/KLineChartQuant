import { describe, it, expect } from 'vitest'
import {
  createIndicatorState,
  resolveModeIndicatorInstances,
  type IndicatorInstanceSpec,
} from '../indicatorState'
import '../../renderers/subVolume'

describe('indicatorState', () => {
  it('reuses a user sub-pane when a mode requests the same indicator', () => {
    const requested: IndicatorInstanceSpec[] = [
      {
        instanceId: 'mode:timeshare',
        indicatorId: 'timeShare',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: {},
      },
      {
        instanceId: 'mode:timeshare-volume',
        indicatorId: 'volume',
        paneId: 'timeshare_volume',
        role: 'sub',
        ordinal: 0,
        params: {},
      },
    ]
    const current: IndicatorInstanceSpec[] = [
      {
        instanceId: 'user:volume',
        indicatorId: 'VOL',
        paneId: 'VOL_0',
        role: 'sub',
        ordinal: 0,
        params: {},
      },
    ]

    expect(resolveModeIndicatorInstances(requested, current)).toEqual([requested[0]])
  })

  it('upsert adds and merges params immutably', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', { period: 5 })
    expect(m.readonly.instances()).toEqual([
      {
        instanceId: 'main:MA',
        indicatorId: 'MA',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: { period: 5 },
      },
    ])
    const first = m.readonly.instances()
    m.actions.upsertMain('MA', { period: 10, color: 'red' })
    const second = m.readonly.instances()
    expect(second).not.toBe(first)
    expect(second[0]?.params).toEqual({ period: 10, color: 'red' })
    expect(first[0]?.params).toEqual({ period: 5 })
  })

  it('remove and clear', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', {})
    m.actions.upsertMain('BOLL', {})
    m.actions.removeMain('MA')
    expect(m.readonly.instances().some((instance) => instance.indicatorId === 'MA')).toBe(false)
    expect(m.readonly.instances().some((instance) => instance.indicatorId === 'BOLL')).toBe(true)
    m.actions.clearMain()
    expect(m.readonly.instances()).toEqual([])
  })

  it('readonly has no set at runtime', () => {
    const m = createIndicatorState()
    expect((m.readonly.instances as any).set).toBeUndefined()
  })

  it('setParams only works when entry exists', () => {
    const m = createIndicatorState()
    m.actions.setMainParams('MA', { period: 10 })
    expect(m.readonly.instances()).toEqual([])
    m.actions.upsertMain('MA', { period: 5 })
    m.actions.setMainParams('MA', { period: 10 })
    expect(m.readonly.instances()[0]?.params).toEqual({ period: 10 })
  })

  it('external mutation of returned instances or params does not alter store', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', { period: 5 })
    const instances = m.readonly.instances() as IndicatorInstanceSpec[]
    const entry = instances[0]!
    expect(() =>
      instances.push({ indicatorId: 'HACK', paneId: 'main', role: 'main', params: {} }),
    ).toThrow()
    expect(() => {
      ;(entry.params as Record<string, number>).period = 99
    }).toThrow()
    expect(m.readonly.instances()[0]?.params).toEqual({ period: 5 })
    expect(m.readonly.instances().some((instance) => instance.indicatorId === 'HACK')).toBe(false)
  })

  it('replaceAllMain deep-copies instances so caller mutation is ignored', () => {
    const m = createIndicatorState()
    const params = { period: 5 }
    const input = [{ indicatorId: 'MA', paneId: 'main', role: 'main' as const, params }]
    m.actions.replaceAllMain(input)
    input.push({ indicatorId: 'BOLL', paneId: 'main', role: 'main', params: { n: 20 } })
    params.period = 99
    expect(m.readonly.instances()).toEqual([
      expect.objectContaining({ instanceId: 'legacy:main', ordinal: 0, indicatorId: 'MA' }),
    ])
  })

  it('stores main and sub indicators in one ordered instance collection', () => {
    const m = createIndicatorState()
    m.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'RSI', params: { period1: 6 } })
    m.actions.upsertMain('MA', { period: 5 })

    expect(m.readonly.instances()).toEqual([
      expect.objectContaining({ instanceId: 'main:MA', ordinal: 0, indicatorId: 'MA' }),
      expect.objectContaining({ instanceId: 'legacy:RSI_0', ordinal: 0, indicatorId: 'RSI' }),
    ])
    expect(m.readonly.subPanes()).toEqual([
      expect.objectContaining({ instanceId: 'legacy:RSI_0', ordinal: 0, indicatorId: 'RSI' }),
    ])
  })

  it('keeps one main instance per indicator and one sub instance per pane', () => {
    const m = createIndicatorState()
    m.actions.upsertMain('MA', { period: 5 })
    m.actions.upsertMain('MA', { color: 'red' })
    m.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'RSI', params: { period1: 6 } })
    m.actions.upsertSub({ paneId: 'RSI_0', indicatorId: 'MACD', params: { fast: 12 } })
    m.actions.upsertSub({ paneId: 'RSI_1', indicatorId: 'RSI', params: { period1: 14 } })

    expect(m.readonly.instances()).toEqual([
      {
        instanceId: 'main:MA',
        indicatorId: 'MA',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: { period: 5, color: 'red' },
      },
      {
        instanceId: 'legacy:RSI_0',
        indicatorId: 'MACD',
        paneId: 'RSI_0',
        role: 'sub',
        ordinal: 0,
        params: { fast: 12 },
      },
      {
        instanceId: 'legacy:RSI_1',
        indicatorId: 'RSI',
        paneId: 'RSI_1',
        role: 'sub',
        ordinal: 0,
        params: { period1: 14 },
      },
    ])
  })
})
