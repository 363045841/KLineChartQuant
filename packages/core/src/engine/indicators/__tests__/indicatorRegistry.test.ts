import { describe, expect, it, vi } from 'vitest'
import { IndicatorRegistry } from '../indicatorRegistry'
import type { IndicatorMetadata } from '../indicatorMetadata'

function createMeta(overrides: Partial<IndicatorMetadata> = {}): IndicatorMetadata {
  return {
    name: 'rsi',
    aliases: ['relativeStrength'],
    displayName: 'RSI',
    category: 'oscillator',
    stateKey: (paneId: string) => `indicator:rsi:${paneId}`,
    defaultPaneId: 'sub_RSI',
    rendererFactory: vi.fn() as any,
    ...overrides,
  }
}

describe('IndicatorRegistry', () => {
  it('resolves indicators by name, displayName, aliases, and case-insensitive ids', () => {
    const registry = new IndicatorRegistry()
    const meta = createMeta()

    registry.register(meta)

    expect(registry.get('rsi')).toBe(meta)
    expect(registry.get('RSI')).toBe(meta)
    expect(registry.get('relativeStrength')).toBe(meta)
    expect(registry.get('relativestrength')).toBe(meta)
    expect(registry.has(' RSI ')).toBe(true)
  })

  it('throws for missing required metadata fields', () => {
    const registry = new IndicatorRegistry()

    expect(() => registry.register(createMeta({ name: '' }))).toThrow('Indicator name is required')
    expect(() => registry.register(createMeta({ displayName: '' }))).toThrow("displayName is required")
    expect(() => registry.register(createMeta({ rendererFactory: undefined as any }))).toThrow('rendererFactory is required')
  })

  it('replaces old aliases when unregistering', () => {
    const registry = new IndicatorRegistry()
    const meta = createMeta()

    registry.register(meta)

    expect(registry.unregister('RSI')).toBe(true)
    expect(registry.get('rsi')).toBeUndefined()
    expect(registry.get('RSI')).toBeUndefined()
    expect(registry.get('relativeStrength')).toBeUndefined()
    expect(registry.unregister('RSI')).toBe(false)
  })

  it('returns required metadata or throws a descriptive error', () => {
    const registry = new IndicatorRegistry()
    const meta = createMeta()

    registry.register(meta)

    expect(registry.getRequired('RSI')).toBe(meta)
    expect(() => registry.getRequired('missing')).toThrow("Unknown indicator 'missing'")
  })
})
