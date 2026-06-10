import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndicatorSelectorController } from '../createIndicatorSelectorController'
import type { IndicatorDefinition } from '../types'

// ---------------------------------------------------------------------------
// Fixture catalog — 3 main + 3 sub, with param schemas modelled on the real
// indicator data in src/core/renderers/Indicator/indicatorData.ts
// ---------------------------------------------------------------------------

const fixtureCatalog: ReadonlyArray<IndicatorDefinition> = [
    {
        id: 'MA',
        label: 'MA',
        name: 'Moving Average',
        role: 'main',
        params: [
            { key: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 200, step: 1 },
        ],
    },
    {
        id: 'BOLL',
        label: 'BOLL',
        name: 'Bollinger Bands',
        role: 'main',
        params: [
            { key: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 100, step: 1 },
            { key: 'multiplier', label: 'Multiplier', type: 'number', default: 2, min: 0.1, max: 5, step: 0.1 },
        ],
    },
    {
        id: 'EXPMA',
        label: 'EXPMA',
        name: 'Exponential MA',
        role: 'main',
        params: [
            { key: 'fastPeriod', label: 'Fast', type: 'number', default: 12, min: 2, max: 100, step: 1 },
            { key: 'slowPeriod', label: 'Slow', type: 'number', default: 50, min: 2, max: 200, step: 1 },
        ],
    },
    {
        id: 'KDJ',
        label: 'KDJ',
        name: 'Stochastic KDJ',
        role: 'sub',
        params: [
            { key: 'period', label: 'Period', type: 'number', default: 9, min: 2, max: 100, step: 1 },
        ],
    },
    {
        id: 'MACD',
        label: 'MACD',
        name: 'MACD',
        role: 'sub',
        params: [
            { key: 'fast', label: 'Fast', type: 'number', default: 12, min: 2, max: 100, step: 1 },
            { key: 'slow', label: 'Slow', type: 'number', default: 26, min: 2, max: 200, step: 1 },
            { key: 'signal', label: 'Signal', type: 'number', default: 9, min: 2, max: 50, step: 1 },
        ],
    },
    {
        id: 'RSI',
        label: 'RSI',
        name: 'Relative Strength Index',
        role: 'sub',
        params: [
            { key: 'period', label: 'Period', type: 'number', default: 14, min: 2, max: 100, step: 1 },
        ],
    },
]

function makeController() {
    return createIndicatorSelectorController({ catalog: fixtureCatalog })
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('createIndicatorSelectorController — construction', () => {
    it('exposes the provided catalog', () => {
        const c = makeController()
        expect(c.catalog()).toEqual(fixtureCatalog)
    })

    it('starts with empty active list, closed menu and empty query', () => {
        const c = makeController()
        expect(c.active()).toEqual([])
        expect(c.menuOpen()).toBe(false)
        expect(c.searchQuery()).toBe('')
    })

    it('defaults catalog to empty when not provided', () => {
        const c = createIndicatorSelectorController()
        expect(c.catalog()).toEqual([])
        expect(c.filteredMain()).toEqual([])
        expect(c.filteredSub()).toEqual([])
    })

    it('accepts initial active indicators', () => {
        const c = createIndicatorSelectorController({
            catalog: fixtureCatalog,
            active: [
                {
                    id: 'seed-1',
                    definitionId: 'MA',
                    label: 'MA',
                    name: 'Moving Average',
                    role: 'main',
                    params: { period: 20 },
                },
            ],
        })
        expect(c.active()).toHaveLength(1)
        expect(c.isActive('MA')).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// add()
// ---------------------------------------------------------------------------

describe('add', () => {
    it('returns a new instance id and pushes onto active', () => {
        const c = makeController()
        const listener = vi.fn()
        c.active.subscribe(listener)

        const id = c.add('KDJ')

        expect(id).not.toBeNull()
        expect(c.active()).toHaveLength(1)
        expect(c.active()[0]?.definitionId).toBe('KDJ')
        expect(c.active()[0]?.id).toBe(id)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('seeds default params from the definition', () => {
        const c = makeController()
        c.add('BOLL')
        const inst = c.active()[0]
        expect(inst?.params).toEqual({ period: 20, multiplier: 2 })
    })

    it('returns null if the definition is already active', () => {
        const c = makeController()
        const first = c.add('RSI')
        expect(first).not.toBeNull()

        const listener = vi.fn()
        c.active.subscribe(listener)

        const second = c.add('RSI')
        expect(second).toBeNull()
        expect(c.active()).toHaveLength(1)
        expect(listener).not.toHaveBeenCalled()
    })

    it('returns null when the definition id is unknown', () => {
        const c = makeController()
        expect(c.add('NOT_A_REAL_INDICATOR')).toBeNull()
        expect(c.active()).toEqual([])
    })

    it('allows multiple main indicators in insertion order', () => {
        const c = makeController()
        c.add('MA')
        c.add('BOLL')
        const mains = c.active().filter((a) => a.role === 'main')
        expect(mains).toHaveLength(2)
        expect(mains[0]?.definitionId).toBe('MA')
        expect(mains[1]?.definitionId).toBe('BOLL')
    })

    it('keeps mains before subs in display order', () => {
        const c = makeController()
        c.add('KDJ')
        c.add('MA')
        c.add('MACD')
        const order = c.active().map((a) => a.definitionId)
        // main should be first; subs follow in their insertion order
        expect(order[0]).toBe('MA')
        expect(order.slice(1).sort()).toEqual(['KDJ', 'MACD'])
    })
})

// ---------------------------------------------------------------------------
// remove()
// ---------------------------------------------------------------------------

describe('remove', () => {
    it('returns true and emits when the instance exists', () => {
        const c = makeController()
        const id = c.add('KDJ') as string
        const listener = vi.fn()
        c.active.subscribe(listener)

        const ok = c.remove(id)
        expect(ok).toBe(true)
        expect(c.active()).toEqual([])
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('returns false and does NOT emit when the instance is missing', () => {
        const c = makeController()
        const listener = vi.fn()
        c.active.subscribe(listener)

        const ok = c.remove('nonexistent')
        expect(ok).toBe(false)
        expect(listener).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// updateParams()
// ---------------------------------------------------------------------------

describe('updateParams', () => {
    it('merges new param values immutably and emits', () => {
        const c = makeController()
        const id = c.add('BOLL') as string
        const before = c.active()[0]

        const listener = vi.fn()
        c.active.subscribe(listener)

        const ok = c.updateParams(id, { period: 30 })
        expect(ok).toBe(true)

        const after = c.active()[0]
        expect(after?.params).toEqual({ period: 30, multiplier: 2 })
        // immutability: the original instance object should not be mutated
        expect(before?.params).toEqual({ period: 20, multiplier: 2 })
        expect(after).not.toBe(before)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('supports number, string and boolean param values', () => {
        const c = makeController()
        const id = c.add('KDJ') as string
        const ok = c.updateParams(id, { period: 21, label: 'fast', visible: false })
        expect(ok).toBe(true)
        expect(c.active()[0]?.params).toEqual({
            period: 21,
            label: 'fast',
            visible: false,
        })
    })

    it('returns false and does not emit for an unknown instance id', () => {
        const c = makeController()
        c.add('MA')
        const listener = vi.fn()
        c.active.subscribe(listener)

        const ok = c.updateParams('nonexistent', { period: 5 })
        expect(ok).toBe(false)
        expect(listener).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// reorder()
// ---------------------------------------------------------------------------

describe('reorder', () => {
    it('moves a sub indicator from one position to another', () => {
        const c = makeController()
        const a = c.add('KDJ') as string
        const b = c.add('MACD') as string
        const cc = c.add('RSI') as string

        // initial: [KDJ, MACD, RSI]
        expect(c.active().map((x) => x.id)).toEqual([a, b, cc])

        const ok = c.reorder(cc, a)
        expect(ok).toBe(true)
        // RSI now sits where KDJ was → [RSI, KDJ, MACD]
        expect(c.active().map((x) => x.id)).toEqual([cc, a, b])
    })

    it('refuses to reorder when source is a main indicator', () => {
        const c = makeController()
        const mainId = c.add('MA') as string
        const subId = c.add('KDJ') as string
        const ok = c.reorder(mainId, subId)
        expect(ok).toBe(false)
    })

    it('refuses to reorder when target is a main indicator', () => {
        const c = makeController()
        const mainId = c.add('MA') as string
        const subId = c.add('KDJ') as string
        const ok = c.reorder(subId, mainId)
        expect(ok).toBe(false)
    })

    it('returns false when source equals target', () => {
        const c = makeController()
        const id = c.add('KDJ') as string
        const ok = c.reorder(id, id)
        expect(ok).toBe(false)
    })

    it('returns false when an instance id is unknown', () => {
        const c = makeController()
        const id = c.add('KDJ') as string
        expect(c.reorder(id, 'nope')).toBe(false)
        expect(c.reorder('nope', id)).toBe(false)
    })

    it('mains stay pinned to the front after a sub reorder', () => {
        const c = makeController()
        c.add('MA')
        const k = c.add('KDJ') as string
        const m = c.add('MACD') as string
        c.reorder(m, k)
        const roles = c.active().map((x) => x.role)
        expect(roles[0]).toBe('main')
        // remaining subs swapped order
        expect(c.active().slice(1).map((x) => x.definitionId)).toEqual([
            'MACD',
            'KDJ',
        ])
    })
})

// ---------------------------------------------------------------------------
// Menu state
// ---------------------------------------------------------------------------

describe('menu state', () => {
    let c: ReturnType<typeof makeController>
    beforeEach(() => {
        c = makeController()
    })

    it('openMenu sets menuOpen to true', () => {
        c.openMenu()
        expect(c.menuOpen()).toBe(true)
    })

    it('closeMenu sets menuOpen to false', () => {
        c.openMenu()
        c.closeMenu()
        expect(c.menuOpen()).toBe(false)
    })

    it('toggleMenu flips menuOpen', () => {
        expect(c.menuOpen()).toBe(false)
        c.toggleMenu()
        expect(c.menuOpen()).toBe(true)
        c.toggleMenu()
        expect(c.menuOpen()).toBe(false)
    })

    it('notifies subscribers on each transition', () => {
        const listener = vi.fn()
        c.menuOpen.subscribe(listener)
        c.openMenu()
        c.openMenu() // idempotent — no second notification
        c.closeMenu()
        expect(listener).toHaveBeenCalledTimes(2)
    })
})

// ---------------------------------------------------------------------------
// Search / filtering
// ---------------------------------------------------------------------------

describe('search / filtering', () => {
    it('filteredMain and filteredSub default to all definitions in their role', () => {
        const c = makeController()
        expect(c.filteredMain().map((d) => d.id)).toEqual(['MA', 'BOLL', 'EXPMA'])
        expect(c.filteredSub().map((d) => d.id)).toEqual(['KDJ', 'MACD', 'RSI'])
    })

    it('setSearchQuery does case-insensitive partial match on label', () => {
        const c = makeController()
        c.setSearchQuery('ma')
        // matches MA (label), MACD (label), EXPMA (label suffix), Moving Average (name)
        const ids = new Set(
            c.filteredMain().concat(c.filteredSub()).map((d) => d.id),
        )
        expect(ids.has('MA')).toBe(true)
        expect(ids.has('MACD')).toBe(true)
        expect(ids.has('EXPMA')).toBe(true)
    })

    it('matches against name as well as label', () => {
        const c = makeController()
        c.setSearchQuery('Bollinger')
        expect(c.filteredMain().map((d) => d.id)).toEqual(['BOLL'])
        expect(c.filteredSub()).toEqual([])
    })

    it('upper / lower case does not matter', () => {
        const c = makeController()
        c.setSearchQuery('STOCHASTIC')
        expect(c.filteredSub().map((d) => d.id)).toEqual(['KDJ'])
    })

    it('an empty query restores the full role-partitioned list', () => {
        const c = makeController()
        c.setSearchQuery('boll')
        expect(c.filteredMain()).toHaveLength(1)
        c.setSearchQuery('')
        expect(c.filteredMain()).toHaveLength(3)
        expect(c.filteredSub()).toHaveLength(3)
    })

    it('notifies subscribers when the query changes', () => {
        const c = makeController()
        const listener = vi.fn()
        c.filteredSub.subscribe(listener)
        c.setSearchQuery('rsi')
        expect(listener).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// isActive
// ---------------------------------------------------------------------------

describe('isActive', () => {
    it('reflects the active state by definition id', () => {
        const c = makeController()
        expect(c.isActive('MA')).toBe(false)
        c.add('MA')
        expect(c.isActive('MA')).toBe(true)
        expect(c.isActive('BOLL')).toBe(false)
    })

    it('reads from the definition id, not the instance id', () => {
        const c = makeController()
        const instId = c.add('RSI') as string
        // not active by instance id
        expect(c.isActive(instId)).toBe(false)
        // active by definition id
        expect(c.isActive('RSI')).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
    it('subsequent mutations do not emit to previously-attached listeners', () => {
        const c = makeController()
        const id = c.add('KDJ') as string

        const activeListener = vi.fn()
        const menuListener = vi.fn()
        const queryListener = vi.fn()
        c.active.subscribe(activeListener)
        c.menuOpen.subscribe(menuListener)
        c.searchQuery.subscribe(queryListener)

        c.dispose()

        c.add('MACD')
        c.remove(id)
        c.updateParams(id, { period: 99 })
        c.openMenu()
        c.toggleMenu()
        c.setSearchQuery('anything')

        expect(activeListener).not.toHaveBeenCalled()
        expect(menuListener).not.toHaveBeenCalled()
        expect(queryListener).not.toHaveBeenCalled()
    })

    it('is idempotent', () => {
        const c = makeController()
        expect(() => {
            c.dispose()
            c.dispose()
            c.dispose()
        }).not.toThrow()
    })
})
