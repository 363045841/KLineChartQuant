import { describe, it, expect } from 'vitest'
import { createIndicatorState } from '../indicatorState'

describe('indicatorState', () => {
  it('upsert adds and merges params immutably', () => {
    const m = createIndicatorState()
    m.actions.upsert('MA', { period: 5 })
    expect(m.readonly.mainIndicators().get('MA')?.params).toEqual({ period: 5 })
    const first = m.readonly.mainIndicators()
    m.actions.upsert('MA', { period: 10, color: 'red' })
    const second = m.readonly.mainIndicators()
    expect(second).not.toBe(first)
    expect(second.get('MA')?.params).toEqual({ period: 10, color: 'red' })
    expect(first.get('MA')?.params).toEqual({ period: 5 })
  })

  it('remove and clear', () => {
    const m = createIndicatorState()
    m.actions.upsert('MA', {})
    m.actions.upsert('BOLL', {})
    m.actions.remove('MA')
    expect(m.readonly.mainIndicators().has('MA')).toBe(false)
    expect(m.readonly.mainIndicators().has('BOLL')).toBe(true)
    m.actions.clear()
    expect(m.readonly.mainIndicators().size).toBe(0)
  })

  it('readonly has no set at runtime', () => {
    const m = createIndicatorState()
    expect((m.readonly.mainIndicators as any).set).toBeUndefined()
  })

  it('setParams only works when entry exists', () => {
    const m = createIndicatorState()
    m.actions.setParams('MA', { period: 10 })
    expect(m.readonly.mainIndicators().size).toBe(0)
    m.actions.upsert('MA', { period: 5 })
    m.actions.setParams('MA', { period: 10 })
    expect(m.readonly.mainIndicators().get('MA')?.params).toEqual({ period: 10 })
  })

  it('external mutation of returned map/params does not alter store', () => {
    const m = createIndicatorState()
    m.actions.upsert('MA', { period: 5 })
    const map = m.readonly.mainIndicators() as Map<string, { params: Record<string, number> }>
    const entry = map.get('MA')!
    expect(() => map.set('HACK', { params: { period: 1 } })).toThrow()
    expect(() => {
      entry.params.period = 99
    }).toThrow()
    expect(m.readonly.mainIndicators().get('MA')?.params).toEqual({ period: 5 })
    expect(m.readonly.mainIndicators().has('HACK')).toBe(false)
  })

  it('replaceAll deep-copies entries so caller map mutation is ignored', () => {
    const m = createIndicatorState()
    const input = new Map([['MA', { params: { period: 5 } }]])
    m.actions.replaceAll(input)
    input.set('BOLL', { params: { n: 20 } })
    input.get('MA')!.params.period = 99
    expect(m.readonly.mainIndicators().size).toBe(1)
    expect(m.readonly.mainIndicators().get('MA')?.params).toEqual({ period: 5 })
  })
})
