import { describe, it, expect } from 'vitest'
import {
  serialize,
  deserialize,
  ChartSerializationError,
} from '../serialization'

describe('serialize', () => {
  it('produces a SerializedChartState with schemaVersion 1 and a parseable timestamp', () => {
    const out = serialize({
      label: 'Test setup',
      viewport: { zoomLevel: 5, visibleFrom: 0, visibleTo: 100 },
    })
    expect(out.schemaVersion).toBe(1)
    expect(out.label).toBe('Test setup')
    expect(Date.parse(out.snapshotTakenAt)).not.toBeNaN()
    expect(out.controllers.viewport?.zoomLevel).toBe(5)
  })

  it('omits absent controllers from the output', () => {
    const out = serialize({})
    expect(out.controllers.viewport).toBeUndefined()
    expect(out.controllers.theme).toBeUndefined()
  })

  it('includes all controller blocks when provided', () => {
    const out = serialize({
      viewport: { zoomLevel: 1, visibleFrom: 0, visibleTo: 10 },
      theme: 'dark',
      indicators: [{ definitionId: 'MA', params: { period: 20 } }],
      alerts: [
        {
          id: 'a1',
          name: 'BTC 100k',
          predicate: {
            kind: 'price-cross',
            price: 100_000,
            direction: 'up',
          },
          oneShot: true,
        },
      ],
    })
    expect(out.controllers.viewport).toBeDefined()
    expect(out.controllers.theme).toBe('dark')
    expect(out.controllers.indicators).toHaveLength(1)
    expect(out.controllers.alerts).toHaveLength(1)
  })
})

describe('deserialize', () => {
  it('round-trips through JSON', () => {
    const original = serialize({ label: 'a', theme: 'dark' })
    const back = deserialize(JSON.stringify(original))
    expect(back.schemaVersion).toBe(1)
    expect(back.label).toBe('a')
    expect(back.controllers.theme).toBe('dark')
  })

  it('throws ChartSerializationError on invalid JSON', () => {
    expect(() => deserialize('not json')).toThrowError(ChartSerializationError)
  })

  it('throws on non-object root', () => {
    expect(() => deserialize('"a string"')).toThrowError(
      /NOT_OBJECT|root must be/,
    )
  })

  it('throws on wrong schemaVersion', () => {
    const bad = JSON.stringify({
      schemaVersion: 2,
      snapshotTakenAt: new Date().toISOString(),
      controllers: {},
    })
    expect(() => deserialize(bad)).toThrowError(/schemaVersion/)
  })

  it('throws on missing/invalid snapshotTakenAt', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      controllers: {},
    })
    expect(() => deserialize(bad)).toThrowError(/INVALID_TIMESTAMP|ISO/)
  })

  it('throws when controllers is missing', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      snapshotTakenAt: new Date().toISOString(),
    })
    expect(() => deserialize(bad)).toThrowError(
      /MISSING_CONTROLLERS|controllers/,
    )
  })

  it('NEVER eval()s — payload is data-only', () => {
    const evil = JSON.stringify({
      schemaVersion: 1,
      snapshotTakenAt: new Date().toISOString(),
      controllers: {
        alerts: [
          {
            id: 'a',
            name: 'a',
            predicate: { evil: 'process.exit(1)' },
            oneShot: true,
          },
        ],
      },
    })
    const back = deserialize(evil)
    const a = back.controllers.alerts?.[0]
    expect(a?.predicate).toEqual({ evil: 'process.exit(1)' })
  })
})
