import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '../../../controllers/types'
import {
  ComparisonCommands,
  type ComparisonCommandsDependencies,
} from '../comparisonCommands'
import { symbolSpecIdentityKey } from '../symbolIdentity'

const PRIMARY: SymbolSpec = {
  symbol: 'MAIN',
  market: 'CN',
  exchange: 'SSE',
  source: 'mock',
  period: 'daily',
  adjust: 'none',
}

const COMPARISON: SymbolSpec = {
  symbol: 'CMP',
  market: 'CN',
  exchange: 'SSE',
  source: 'mock',
  period: 'daily',
  adjust: 'none',
}

function createHarness(initial: ReadonlyArray<SymbolSpec>) {
  let symbols = initial.map((spec) => ({ ...spec }))
  const commitSymbols = vi.fn((next: ReadonlyArray<SymbolSpec>) => {
    symbols = next.map((spec) => ({ ...spec }))
  })
  const setComparisonViewActive = vi.fn()
  const scheduleDraw = vi.fn()
  const validateSpec = vi.fn()
  const colors = new Map<string, string>()
  const dependencies: ComparisonCommandsDependencies = {
    getSymbols: () => symbols,
    commitSymbols,
    setComparisonViewActive,
    validateSpec,
    getColor: (identity) => colors.get(identity),
    scheduleDraw,
  }
  return {
    commands: new ComparisonCommands(dependencies),
    commitSymbols,
    setComparisonViewActive,
    scheduleDraw,
    validateSpec,
    colors,
    symbols: () => symbols,
  }
}

describe('ComparisonCommands', () => {
  it('creates a comparison, activates the comparison view, and schedules one draw', () => {
    const harness = createHarness([PRIMARY])

    expect(harness.commands.create({ symbol: 'CMP' })).toBe(true)

    expect(harness.validateSpec).toHaveBeenCalledOnce()
    expect(harness.commitSymbols).toHaveBeenCalledOnce()
    expect(harness.symbols().map((spec) => spec.symbol)).toEqual(['MAIN', 'CMP'])
    expect(harness.setComparisonViewActive).toHaveBeenCalledWith(true)
    expect(harness.scheduleDraw).toHaveBeenCalledOnce()
  })

  it('fills omitted routing fields from the primary symbol', () => {
    const harness = createHarness([PRIMARY])

    harness.commands.create({ symbol: 'CMP' })

    expect(harness.symbols()[1]).toEqual({
      symbol: 'CMP',
      market: 'CN',
      exchange: 'SSE',
      source: 'mock',
      period: 'daily',
      adjust: 'none',
    })
  })

  it('rejects a duplicate comparison without writing symbols', () => {
    const harness = createHarness([PRIMARY, COMPARISON])

    expect(harness.commands.create({ symbol: 'CMP' })).toBe(false)
    expect(harness.commitSymbols).not.toHaveBeenCalled()
  })

  it('validates the spec before committing symbols', () => {
    const harness = createHarness([PRIMARY])
    harness.validateSpec.mockImplementation(() => {
      throw new Error('Market session is not registered: FUTURES')
    })

    expect(() => harness.commands.create({ symbol: 'CMP', market: 'FUTURES' })).toThrow(
      'Market session is not registered: FUTURES',
    )
    expect(harness.commitSymbols).not.toHaveBeenCalled()
  })

  it('does nothing without a primary symbol', () => {
    const harness = createHarness([])

    expect(harness.commands.create({ symbol: 'CMP' })).toBe(false)
    expect(harness.commitSymbols).not.toHaveBeenCalled()
  })

  it('keeps the comparison view while other comparisons remain', () => {
    const harness = createHarness([PRIMARY, COMPARISON, { ...COMPARISON, symbol: 'SECOND' }])

    expect(harness.commands.remove({ identity: 'CMP' })).toBe(true)
    expect(harness.symbols().map((spec) => spec.symbol)).toEqual(['MAIN', 'SECOND'])
    expect(harness.setComparisonViewActive).not.toHaveBeenCalled()
  })

  it('removes the last comparison and leaves the comparison view', () => {
    const harness = createHarness([PRIMARY, COMPARISON])

    expect(harness.commands.remove({ identity: symbolSpecIdentityKey(COMPARISON) })).toBe(true)
    expect(harness.symbols().map((spec) => spec.symbol)).toEqual(['MAIN'])
    expect(harness.setComparisonViewActive).toHaveBeenCalledWith(false)
    expect(harness.scheduleDraw).toHaveBeenCalledOnce()
  })

  it('ignores an unknown removal target', () => {
    const harness = createHarness([PRIMARY, COMPARISON])

    expect(harness.commands.remove({ identity: 'missing' })).toBe(false)
    expect(harness.commitSymbols).not.toHaveBeenCalled()
  })

  it('clears every comparison and reports the removed count', () => {
    const harness = createHarness([PRIMARY, COMPARISON, { ...COMPARISON, symbol: 'SECOND' }])

    expect(harness.commands.clear()).toBe(2)
    expect(harness.symbols().map((spec) => spec.symbol)).toEqual(['MAIN'])
    expect(harness.setComparisonViewActive).toHaveBeenCalledWith(false)
  })

  it('does not clear when no comparison exists', () => {
    const harness = createHarness([PRIMARY])

    expect(harness.commands.clear()).toBe(0)
    expect(harness.commitSymbols).not.toHaveBeenCalled()
  })

  it('lists identities, specs, and assigned colors', () => {
    const harness = createHarness([PRIMARY, COMPARISON])
    harness.colors.set(symbolSpecIdentityKey(COMPARISON), '#f59e0b')

    expect(harness.commands.list()).toEqual([
      {
        identity: symbolSpecIdentityKey(COMPARISON),
        spec: COMPARISON,
        color: '#f59e0b',
      },
    ])
  })
})
