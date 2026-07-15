/**
 * Tests for `createShortcutRegistry` + the parser helpers.
 *
 * Coverage:
 *   1. parseCombo  — happy paths, all modifier aliases, errors on
 *      malformed inputs (empty, no key, multi-key).
 *   2. canonicalCombo — canonical order, modifier-order independence,
 *      single-letter uppercasing, named-key preservation.
 *   3. register / unregister / findByCombo — basic CRUD.
 *   4. Conflict detection — same combo, different ids throws.
 *   5. Re-binding same id to a new combo drops the old binding.
 *   6. findByKeyboardEvent — happy path + missing modifier + extra
 *      modifier + non-matching key.
 *   7. Platform Mod resolution — mac → metaKey, other → ctrlKey.
 *   8. `when` predicate gates lookup.
 *   9. dispose() makes everything a no-op.
 */

import { describe, it, expect } from 'vitest'

import { createShortcutRegistry, parseCombo, canonicalCombo, type KeyboardEventLike } from '..'
import { isKLineChartError } from '../../../errors'

function evt(over: Partial<KeyboardEventLike>): KeyboardEventLike {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  }
}

// ---------------------------------------------------------------------------
// parseCombo
// ---------------------------------------------------------------------------

describe('parseCombo', () => {
  it('parses a simple letter', () => {
    const p = parseCombo('k')
    expect(p.key).toBe('k')
    expect(p.requiresMod).toBe(false)
    expect(p.ctrlKey).toBe(false)
  })

  it.each([
    ['Mod+K', { requiresMod: true, key: 'K' }],
    ['Ctrl+K', { ctrlKey: true, key: 'K' }],
    ['Control+K', { ctrlKey: true, key: 'K' }],
    ['Meta+K', { metaKey: true, key: 'K' }],
    ['Cmd+K', { metaKey: true, key: 'K' }],
    ['Command+K', { metaKey: true, key: 'K' }],
    ['Alt+K', { altKey: true, key: 'K' }],
    ['Option+K', { altKey: true, key: 'K' }],
    ['Shift+K', { shiftKey: true, key: 'K' }],
  ] as const)('%s parses modifier correctly', (src, expected) => {
    const p = parseCombo(src)
    for (const [k, v] of Object.entries(expected)) {
      expect((p as unknown as Record<string, unknown>)[k]).toBe(v)
    }
  })

  it('parses named keys', () => {
    expect(parseCombo('ArrowRight').key).toBe('ArrowRight')
    expect(parseCombo('Shift+ArrowRight').shiftKey).toBe(true)
    expect(parseCombo('F5').key).toBe('F5')
  })

  it('throws on empty input', () => {
    try {
      parseCombo('')
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })

  it('throws on only modifiers, no key', () => {
    try {
      parseCombo('Shift+Mod')
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })

  it('throws on multiple non-modifier keys', () => {
    try {
      parseCombo('K+J')
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })

  it('ignores extra whitespace', () => {
    expect(parseCombo('  Mod + K ').key).toBe('K')
    expect(parseCombo('  Mod + K ').requiresMod).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// canonicalCombo
// ---------------------------------------------------------------------------

describe('canonicalCombo', () => {
  it('sorts modifiers into canonical order', () => {
    expect(canonicalCombo('Shift+Mod+K')).toBe('Mod+Shift+K')
    expect(canonicalCombo('Alt+Shift+Mod+K')).toBe('Mod+Alt+Shift+K')
  })

  it('uppercases single-letter keys', () => {
    expect(canonicalCombo('mod+k')).toBe('Mod+K')
  })

  it('preserves named-key casing', () => {
    expect(canonicalCombo('shift+arrowright')).toBe('Shift+arrowright')
    expect(canonicalCombo('Shift+ArrowRight')).toBe('Shift+ArrowRight')
  })

  it('is idempotent', () => {
    const c = canonicalCombo('alt+shift+mod+k')
    expect(canonicalCombo(c)).toBe(c)
  })
})

// ---------------------------------------------------------------------------
// register / unregister / findByCombo
// ---------------------------------------------------------------------------

describe('register / unregister / findByCombo', () => {
  it('round-trips a registered shortcut by canonical combo', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'pan.left', label: 'Pan left', combo: 'ArrowLeft', command: 'pan' })
    expect(r.findByCombo('ArrowLeft')?.id).toBe('pan.left')
    expect(r.shortcuts.peek()).toHaveLength(1)
  })

  it('canonicalises during lookup', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'open', label: 'Open', combo: 'Mod+K', command: 'open' })
    expect(r.findByCombo('Shift+Mod+K')).toBeNull()
    expect(r.findByCombo('Mod+K')?.id).toBe('open')
  })

  it('unregister removes the binding', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'open', label: 'Open', combo: 'Mod+K', command: 'open' })
    r.unregister('open')
    expect(r.findByCombo('Mod+K')).toBeNull()
    expect(r.shortcuts.peek()).toHaveLength(0)
  })

  it('unregistering an unknown id is a no-op', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    expect(() => r.unregister('nope')).not.toThrow()
  })

  it('throws on empty id', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    try {
      r.register({ id: '', label: '', combo: 'K', command: 'x' })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe('conflict detection', () => {
  it('throws when a second id registers the same canonical combo', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'a', label: 'A', combo: 'Mod+K', command: 'aCmd' })
    try {
      r.register({ id: 'b', label: 'B', combo: 'Shift+Mod+K', command: 'bCmd' })
      // Note: Shift+Mod+K canonicalises differently, so this is the
      // POSITIVE path — the test below covers the conflict.
    } catch {
      expect.fail('Shift+Mod+K is a different combo and must not conflict')
    }
    try {
      r.register({ id: 'c', label: 'C', combo: 'Mod+K', command: 'cCmd' })
      expect.fail('expected conflict throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
      expect((e as Error).message).toContain('a')
    }
  })

  it('re-registering the same id with the same combo is a no-op', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'a', label: 'A', combo: 'Mod+K', command: 'aCmd' })
    expect(() =>
      r.register({ id: 'a', label: 'A-renamed', combo: 'Mod+K', command: 'aCmd' }),
    ).not.toThrow()
    expect(r.findByCombo('Mod+K')?.label).toBe('A-renamed')
  })

  it('re-binding same id to a different combo drops the old binding', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'a', label: 'A', combo: 'Mod+K', command: 'aCmd' })
    r.register({ id: 'a', label: 'A', combo: 'Mod+J', command: 'aCmd' })
    expect(r.findByCombo('Mod+K')).toBeNull()
    expect(r.findByCombo('Mod+J')?.id).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// findByKeyboardEvent
// ---------------------------------------------------------------------------

describe('findByKeyboardEvent', () => {
  it('matches a basic letter', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'r', label: 'Reset', combo: 'R', command: 'reset' })
    expect(r.findByKeyboardEvent(evt({ key: 'r' }))?.id).toBe('r')
    expect(r.findByKeyboardEvent(evt({ key: 'R' }))?.id).toBe('r')
  })

  it('rejects when modifier missing', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'open', label: 'Open', combo: 'Mod+K', command: 'open' })
    expect(r.findByKeyboardEvent(evt({ key: 'k' }))).toBeNull()
  })

  it('rejects when extra modifier present', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'r', label: 'Reset', combo: 'R', command: 'reset' })
    expect(r.findByKeyboardEvent(evt({ key: 'r', shiftKey: true }))).toBeNull()
  })

  it('rejects when key differs', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'open', label: 'Open', combo: 'Mod+K', command: 'open' })
    expect(r.findByKeyboardEvent(evt({ key: 'j', ctrlKey: true }))).toBeNull()
  })

  it('matches named keys', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'panL', label: 'Pan left', combo: 'ArrowLeft', command: 'pan' })
    expect(r.findByKeyboardEvent(evt({ key: 'ArrowLeft' }))?.id).toBe('panL')
  })
})

// ---------------------------------------------------------------------------
// Platform Mod resolution
// ---------------------------------------------------------------------------

describe('platform Mod resolution', () => {
  it('on mac: Mod matches metaKey, not ctrlKey', () => {
    const r = createShortcutRegistry({ platform: 'mac' })
    r.register({ id: 'open', label: 'Open', combo: 'Mod+K', command: 'open' })
    expect(r.findByKeyboardEvent(evt({ key: 'k', metaKey: true }))?.id).toBe('open')
    expect(r.findByKeyboardEvent(evt({ key: 'k', ctrlKey: true }))).toBeNull()
  })

  it('on win: Mod matches ctrlKey, not metaKey', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'open', label: 'Open', combo: 'Mod+K', command: 'open' })
    expect(r.findByKeyboardEvent(evt({ key: 'k', ctrlKey: true }))?.id).toBe('open')
    expect(r.findByKeyboardEvent(evt({ key: 'k', metaKey: true }))).toBeNull()
  })

  it('explicit Ctrl + Meta still bind on both platforms', () => {
    const r = createShortcutRegistry({ platform: 'mac' })
    r.register({ id: 'a', label: 'A', combo: 'Ctrl+K', command: 'a' })
    expect(r.findByKeyboardEvent(evt({ key: 'k', ctrlKey: true }))?.id).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// `when` predicate
// ---------------------------------------------------------------------------

describe('when predicate', () => {
  it('false predicate skips the shortcut', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    let active = false
    r.register({
      id: 'esc',
      label: 'Cancel tool',
      combo: 'Escape',
      command: 'cancel',
      when: () => active,
    })
    expect(r.findByKeyboardEvent(evt({ key: 'Escape' }))).toBeNull()
    active = true
    expect(r.findByKeyboardEvent(evt({ key: 'Escape' }))?.id).toBe('esc')
  })
})

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('makes register / unregister / findByCombo no-ops', () => {
    const r = createShortcutRegistry({ platform: 'win' })
    r.register({ id: 'a', label: 'A', combo: 'K', command: 'a' })
    r.dispose()
    expect(r.findByCombo('K')).toBeNull()
    expect(() => r.register({ id: 'b', label: 'B', combo: 'J', command: 'b' })).not.toThrow()
    expect(r.findByCombo('J')).toBeNull()
  })
})
