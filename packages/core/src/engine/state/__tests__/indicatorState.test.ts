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
})
