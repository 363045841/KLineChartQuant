/**
 * Keyboard shortcut registry — framework-agnostic, signal-based.
 *
 * Why this exists: every chart library either hard-codes shortcuts (TV-style
 * inflexibility) or punts to the host app (every adapter reinvents the
 * wheel). The registry below is the shared primitive: controllers and
 * adapters publish `ShortcutDef[]`s, host apps query by combo, and the
 * normalisation/conflict layer lives in one place.
 *
 * Design choices:
 *
 *   - Combos are STRINGS like `'Mod+K'`, `'Shift+ArrowRight'`,
 *     `'Alt+Mod+0'`. Parsed deterministically; whitespace ignored;
 *     modifier order in the source doesn't matter (`'Shift+Mod+K'`
 *     and `'Mod+Shift+K'` normalise to the same canonical form).
 *
 *   - `Mod` is platform-agnostic: maps to `Meta` on macOS and `Ctrl`
 *     elsewhere. Host apps query with their own `KeyboardEvent` and
 *     the registry hands back the matching shortcut.
 *
 *   - Conflict detection: registering two `ShortcutDef`s with the same
 *     normalised combo throws `KLineChartError('INPUT_SHORTCUT_CONFLICT')`.
 *     Pulls the prior registration into the error message so the
 *     developer sees both ids.
 *
 *   - The signal-based shape mirrors every other controller in this
 *     package (alerts, indicators, drawing). Subscribers — typically
 *     a debug-overlay or settings UI — see the live registration list.
 *
 *   - Pure data: no `addEventListener`, no `window` access. The bridge
 *     to DOM events is the *consumer's* job, and a one-liner:
 *
 *       document.addEventListener('keydown', e => {
 *         const hit = registry.findByKeyboardEvent(e)
 *         if (hit !== null) {
 *           e.preventDefault()
 *           runCommand(hit.command, hit.args)
 *         }
 *       })
 */

import { KLineChartError } from '../errors'
import { createSignal, type Signal } from '../reactivity'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * Modifier flag set. Booleans match `KeyboardEvent` getter names so consumers
 * can pass an event directly.
 */
export interface ModifierState {
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/**
 * Result of parsing a combo string. `key` is the case-preserved KeyboardEvent
 * `key` value (e.g. `'k'`, `'ArrowRight'`, `'F5'`). Modifiers are split into
 * the four boolean flags.
 *
 * `Mod` from the source string is recorded in `requiresMod`: true means
 * "match if Ctrl on non-mac OR Meta on mac"; false means the combo doesn't
 * use the platform modifier.
 */
export interface ParsedCombo {
  readonly key: string
  readonly requiresMod: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/**
 * The shape registered via `registry.register({...})`. `args` is opaque to
 * the registry; consumers pass it through to their command runner.
 */
export interface ShortcutDef<TArgs = unknown> {
  /** Stable id (e.g. `'pan.left'`). Used for unregister + error messages. */
  readonly id: string
  /** Human label for tooltips / settings UI. */
  readonly label: string
  /** Combo source string. See module header for the grammar. */
  readonly combo: string
  /** Opaque command identifier — typically a key into your command map. */
  readonly command: string
  /** Optional opaque arg payload for the command. */
  readonly args?: TArgs
  /**
   * Optional gating predicate. Evaluated at `findByKeyboardEvent` time
   * with no arguments. Returning false means the shortcut won't match.
   * Use this for context-sensitive bindings (e.g. only fire `ESC` when
   * a drawing tool is active).
   */
  readonly when?: () => boolean
}

export interface ShortcutRegistry {
  /** Read-only signal of all currently-registered shortcuts. */
  readonly shortcuts: Signal<ReadonlyArray<ShortcutDef>>
  register<TArgs = unknown>(def: ShortcutDef<TArgs>): void
  unregister(id: string): void
  /** Lookup by raw combo string (normalised). */
  findByCombo(combo: string): ShortcutDef | null
  /**
   * Lookup by KeyboardEvent. The platform is detected once at registry
   * construction time (override via `opts.platform` for testing).
   */
  findByKeyboardEvent(event: KeyboardEventLike): ShortcutDef | null
  /** Returns the canonical form of a combo, useful for tests + tooltips. */
  canonical(combo: string): string
  dispose(): void
}

/**
 * The fields of `KeyboardEvent` we consume. Declaring this locally avoids
 * pulling in DOM types and lets server-side smoke tests pass plain objects.
 */
export interface KeyboardEventLike {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

export interface ShortcutRegistryOptions {
  /**
   * Override platform detection. `'mac'` makes `Mod → Meta`; everything
   * else (`'win'`, `'linux'`, etc.) makes `Mod → Ctrl`. Default:
   * sniff `navigator.platform` if available, else assume non-mac.
   */
  readonly platform?: 'mac' | 'win' | 'linux' | string
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const MODIFIER_TOKENS = new Set([
  'mod',
  'ctrl',
  'control',
  'meta',
  'cmd',
  'command',
  'alt',
  'option',
  'shift',
])

/**
 * Parse a combo source string into the normalised {@link ParsedCombo}.
 * Throws `KLineChartError('INVALID_PARAM')` on malformed input — empty,
 * modifiers without a key, unknown modifier token.
 */
export function parseCombo(source: string): ParsedCombo {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new KLineChartError('INVALID_PARAM', `parseCombo: empty combo`)
  }
  const tokens = source
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) {
    throw new KLineChartError('INVALID_PARAM', `parseCombo: no tokens in ${JSON.stringify(source)}`)
  }
  let requiresMod = false
  let ctrlKey = false
  let metaKey = false
  let altKey = false
  let shiftKey = false
  let keyToken: string | null = null
  for (const t of tokens) {
    const lower = t.toLowerCase()
    if (MODIFIER_TOKENS.has(lower)) {
      switch (lower) {
        case 'mod':
          requiresMod = true
          break
        case 'ctrl':
        case 'control':
          ctrlKey = true
          break
        case 'meta':
        case 'cmd':
        case 'command':
          metaKey = true
          break
        case 'alt':
        case 'option':
          altKey = true
          break
        case 'shift':
          shiftKey = true
          break
      }
    } else {
      // Non-modifier token — must be the (single) key.
      if (keyToken !== null) {
        throw new KLineChartError(
          'INVALID_PARAM',
          `parseCombo: multiple keys in ${JSON.stringify(source)} — combos take exactly one non-modifier`,
        )
      }
      keyToken = t
    }
  }
  if (keyToken === null) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `parseCombo: ${JSON.stringify(source)} has only modifiers, no key`,
    )
  }
  return {
    key: keyToken,
    requiresMod,
    ctrlKey,
    metaKey,
    altKey,
    shiftKey,
  }
}

/**
 * Canonicalise a combo source string. Sorts modifiers into the
 * canonical order (Mod, Ctrl, Meta, Alt, Shift) and lower-cases
 * single-letter keys. `'shift+mod+k'` → `'Mod+Shift+K'`.
 */
export function canonicalCombo(source: string): string {
  const p = parseCombo(source)
  const out: string[] = []
  if (p.requiresMod) out.push('Mod')
  if (p.ctrlKey) out.push('Ctrl')
  if (p.metaKey) out.push('Meta')
  if (p.altKey) out.push('Alt')
  if (p.shiftKey) out.push('Shift')
  out.push(p.key.length === 1 ? p.key.toUpperCase() : p.key)
  return out.join('+')
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatform(): 'mac' | 'other' {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  const platform = nav?.platform ?? nav?.userAgent ?? ''
  return /mac/i.test(platform) ? 'mac' : 'other'
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createShortcutRegistry(opts?: ShortcutRegistryOptions): ShortcutRegistry {
  const platformIsMac =
    opts?.platform !== undefined ? opts.platform === 'mac' : detectPlatform() === 'mac'

  const byCanonical = new Map<string, ShortcutDef>()
  const byId = new Map<string, string>() // id → canonical
  const shortcuts = createSignal<ReadonlyArray<ShortcutDef>>([])
  let disposed = false

  function publish(): void {
    shortcuts.set([...byCanonical.values()])
  }

  function register<TArgs>(def: ShortcutDef<TArgs>): void {
    if (disposed) return
    if (def.id === '' || typeof def.id !== 'string') {
      throw new KLineChartError(
        'INVALID_PARAM',
        `ShortcutRegistry.register: def.id must be a non-empty string`,
      )
    }
    const canonical = canonicalCombo(def.combo)
    const existing = byCanonical.get(canonical)
    if (existing !== undefined && existing.id !== def.id) {
      throw new KLineChartError(
        'INVALID_PARAM',
        `ShortcutRegistry.register: combo ${JSON.stringify(canonical)} is already bound to id ${JSON.stringify(existing.id)} — unregister it before re-binding to ${JSON.stringify(def.id)}`,
      )
    }
    // Re-registering the same id with a new combo: drop the old binding.
    const prevCanonical = byId.get(def.id)
    if (prevCanonical !== undefined && prevCanonical !== canonical) {
      byCanonical.delete(prevCanonical)
    }
    byCanonical.set(canonical, def as ShortcutDef)
    byId.set(def.id, canonical)
    publish()
  }

  function unregister(id: string): void {
    if (disposed) return
    const canonical = byId.get(id)
    if (canonical === undefined) return
    byCanonical.delete(canonical)
    byId.delete(id)
    publish()
  }

  function findByCombo(combo: string): ShortcutDef | null {
    if (disposed) return null
    return byCanonical.get(canonicalCombo(combo)) ?? null
  }

  function findByKeyboardEvent(event: KeyboardEventLike): ShortcutDef | null {
    if (disposed) return null
    for (const def of byCanonical.values()) {
      const parsed = parseCombo(def.combo)
      // Modifier match — Mod expands to platform-correct modifier.
      const modOk = parsed.requiresMod
        ? platformIsMac
          ? event.metaKey && !event.ctrlKey
          : event.ctrlKey && !event.metaKey
        : true
      if (!modOk) continue
      // Explicit Ctrl / Meta / Alt / Shift must match exactly UNLESS
      // requiresMod already accounts for the platform modifier.
      const ctrlOk = parsed.requiresMod
        ? !platformIsMac
          ? event.ctrlKey
          : event.ctrlKey === parsed.ctrlKey
        : event.ctrlKey === parsed.ctrlKey
      const metaOk = parsed.requiresMod
        ? platformIsMac
          ? event.metaKey
          : event.metaKey === parsed.metaKey
        : event.metaKey === parsed.metaKey
      const altOk = event.altKey === parsed.altKey
      const shiftOk = event.shiftKey === parsed.shiftKey
      // Key match: case-insensitive for single-letter keys, exact for
      // named keys (ArrowRight, F5, ...).
      const keyOk =
        parsed.key.length === 1
          ? parsed.key.toLowerCase() === event.key.toLowerCase()
          : parsed.key === event.key
      if (!ctrlOk || !metaOk || !altOk || !shiftOk || !keyOk) continue
      if (def.when !== undefined && !def.when()) continue
      return def
    }
    return null
  }

  function canonical(combo: string): string {
    return canonicalCombo(combo)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    byCanonical.clear()
    byId.clear()
  }

  return {
    shortcuts,
    register,
    unregister,
    findByCombo,
    findByKeyboardEvent,
    canonical,
    dispose,
  }
}
