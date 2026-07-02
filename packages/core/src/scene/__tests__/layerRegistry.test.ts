/**
 * Behaviour tests for `createLayerRegistry` and `BUILTIN_LAYER_TYPES`.
 *
 * The registry is intentionally small: it owns typeId → factory lookups.
 * The tests cover the documented contract:
 * - register / get / unregister round-trips
 * - duplicate registration throws (documented choice; see layerRegistry.ts)
 * - list() exposes a snapshot of all factories
 * - factory.create returns a Layer that conforms to the type
 * - BUILTIN_LAYER_TYPES values are non-empty strings and unique
 * - two registries are independent
 */

import { describe, it, expect } from 'vitest'

import { createLayerRegistry, BUILTIN_LAYER_TYPES, type LayerFactory } from '../layerRegistry'
import type { Layer, PaintContext } from '../types'

// ---------------------------------------------------------------------------
// Test fixture: a no-op Layer factory we can register from many tests.
// ---------------------------------------------------------------------------

interface FixtureConfig {
  z?: number
}

function makeFactory(typeId: string): LayerFactory<FixtureConfig> {
  return {
    typeId,
    role: 'indicator',
    create: (config: FixtureConfig): Layer => {
      return {
        id: `${typeId}::instance`,
        role: 'indicator',
        paneRole: 'main',
        z: config.z ?? 0,
        visible: true,
        paint: (_ctx: PaintContext): void => {
          // no-op
        },
        dispose: (): void => {
          // no-op
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLayerRegistry', () => {
  it('register then get round-trips by typeId', () => {
    const registry = createLayerRegistry()
    const factory = makeFactory('test:alpha')
    registry.register(factory)
    expect(registry.get('test:alpha')).toBe(factory)
  })

  it('get returns null when typeId is not registered', () => {
    const registry = createLayerRegistry()
    expect(registry.get('test:missing')).toBeNull()
  })

  it('duplicate register throws with a message naming the typeId', () => {
    const registry = createLayerRegistry()
    registry.register(makeFactory('test:duplicate'))
    expect(() => registry.register(makeFactory('test:duplicate'))).toThrow(/test:duplicate/)
    // The originally-registered factory is still the one in the table.
    const got = registry.get('test:duplicate')
    expect(got).not.toBeNull()
  })

  it('unregister returns true on hit and false on miss', () => {
    const registry = createLayerRegistry()
    registry.register(makeFactory('test:to-remove'))
    expect(registry.unregister('test:to-remove')).toBe(true)
    expect(registry.get('test:to-remove')).toBeNull()
    expect(registry.unregister('test:to-remove')).toBe(false)
  })

  it('after unregister the same typeId can be registered again', () => {
    const registry = createLayerRegistry()
    const first = makeFactory('test:reuse')
    const second = makeFactory('test:reuse')
    registry.register(first)
    registry.unregister('test:reuse')
    registry.register(second)
    expect(registry.get('test:reuse')).toBe(second)
    expect(registry.get('test:reuse')).not.toBe(first)
  })

  it('list returns every registered factory in registration order', () => {
    const registry = createLayerRegistry()
    const a = makeFactory('test:a')
    const b = makeFactory('test:b')
    const c = makeFactory('test:c')
    registry.register(a)
    registry.register(b)
    registry.register(c)
    const list = registry.list()
    expect(list).toHaveLength(3)
    expect(list[0]).toBe(a)
    expect(list[1]).toBe(b)
    expect(list[2]).toBe(c)
  })

  it('factory.create returns a Layer conforming to the interface', () => {
    const registry = createLayerRegistry()
    const factory = makeFactory('test:create')
    registry.register(factory)
    const created = registry.get('test:create')
    expect(created).not.toBeNull()
    const layer = created!.create({ z: 7 })
    // Spot-check every field the Layer interface requires.
    expect(layer.id).toBe('test:create::instance')
    expect(layer.role).toBe('indicator')
    expect(layer.paneRole).toBe('main')
    expect(layer.z).toBe(7)
    expect(layer.visible).toBe(true)
    expect(typeof layer.paint).toBe('function')
    expect(typeof layer.dispose).toBe('function')
  })

  it('two registries do not share state', () => {
    const a = createLayerRegistry()
    const b = createLayerRegistry()
    a.register(makeFactory('test:shared-typeid'))
    // Registry b never saw the factory.
    expect(b.get('test:shared-typeid')).toBeNull()
    // Registering the same typeId in b succeeds — it's a different table.
    expect(() => b.register(makeFactory('test:shared-typeid'))).not.toThrow()
    expect(b.get('test:shared-typeid')).not.toBeNull()
    expect(a.list()).toHaveLength(1)
    expect(b.list()).toHaveLength(1)
  })
})

describe('BUILTIN_LAYER_TYPES', () => {
  it('every entry is a non-empty string', () => {
    for (const [name, value] of Object.entries(BUILTIN_LAYER_TYPES)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
      // Symbol assertion: the key names map to the constant table.
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  it('every entry is unique (no two keys map to the same string)', () => {
    const values = Object.values(BUILTIN_LAYER_TYPES)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('built-in entries use the "builtin:" prefix and components use "component:"', () => {
    // Existing v0 layers live under builtin:; P1 components under component:.
    // This split is documented in layerRegistry.ts and surfaces in PRs that
    // wire factories — a regression here would silently break that wiring.
    expect(BUILTIN_LAYER_TYPES.CANDLE.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.VOLUME.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.INDICATOR_MA.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.INDICATOR_BOLL.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.DRAWING.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.CROSSHAIR.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.GRID.startsWith('builtin:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.VOLUME_PROFILE.startsWith('component:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.ORDER_BOOK_HEATMAP.startsWith('component:')).toBe(true)
    expect(BUILTIN_LAYER_TYPES.FOOTPRINT.startsWith('component:')).toBe(true)
  })

  it('constants are usable directly as registry typeIds', () => {
    // End-to-end sanity: register a factory under a built-in typeId and
    // look it back up by the same constant.
    const registry = createLayerRegistry()
    const factory: LayerFactory = {
      typeId: BUILTIN_LAYER_TYPES.VOLUME_PROFILE,
      role: 'component',
      create: (_config: unknown): Layer => ({
        id: 'vp-instance',
        role: 'component',
        paneRole: 'main',
        z: 10,
        visible: true,
        paint: (): void => {},
        dispose: (): void => {},
      }),
    }
    registry.register(factory)
    expect(registry.get(BUILTIN_LAYER_TYPES.VOLUME_PROFILE)).toBe(factory)
  })
})
