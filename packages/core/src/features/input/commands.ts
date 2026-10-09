/**
 * Command registry — the named-action layer on top of {@link createShortcutRegistry}.
 *
 * Why this exists: before it, the user path was "component emit → chart
 * component handler → controller method", the Agent path was "tool registry →
 * controller", and keyboard shortcuts were hand-written `keydown` listeners.
 * Nothing shared a command id, so there was no palette, no shortcut sheet and
 * no single place to see what the chart can do.
 *
 * A command is `{ id, title, keywords, shortcut, run }`. Features register
 * commands; the keyboard bridge, the ⌘K palette and the `?` shortcut sheet all
 * read the same registry. `run` must call the same action an Agent tool calls
 * (the README's "Agent = user" rule), and `tool` records which tool that is.
 *
 * Pure data like the shortcut registry: no DOM access. The host decides which
 * element is the command scope and reports, per keyboard event, whether focus
 * is inside it and whether the target is editable.
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { createSignal, type Signal } from '../../foundation/reactivity/index.js'
import {
  canonicalCombo,
  createShortcutRegistry,
  type KeyboardEventLike,
  parseCombo,
  type ShortcutRegistry,
  type ShortcutRegistryOptions,
} from './keyboard.js'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/** Bilingual command title (ADR 0003: bilingual UI). */
export interface CommandTitle {
  readonly zh: string
  readonly en: string
}

export type CommandLocale = keyof CommandTitle

/**
 * Where a shortcut may fire.
 * - `chart` (default): only while focus is inside this registry's scope element.
 * - `global`: also when focus is elsewhere on the page and this scope is the
 *   most recently active one (e.g. ⌘K).
 */
export type CommandScope = 'chart' | 'global'

export interface CommandDef {
  /** Stable dotted id, e.g. `'drawing.delete'`. */
  readonly id: string
  readonly title: CommandTitle
  /** Palette group id, e.g. `'drawing'`, `'view'`, `'settings'`. */
  readonly group?: string
  /** Extra search terms (synonyms, pinyin initials, English aliases). */
  readonly keywords?: ReadonlyArray<string>
  /** One or more combo strings in the {@link parseCombo} grammar. */
  readonly shortcut?: string | ReadonlyArray<string>
  readonly scope?: CommandScope
  /** Allow the shortcut while typing in an input / textarea / contenteditable. */
  readonly allowInEditable?: boolean
  /** List in the palette (default true). Shortcut-only commands set false. */
  readonly palette?: boolean
  /** Name of the Agent tool backed by the same action, if any. */
  readonly tool?: string
  /** Availability gate: unavailable commands are hidden and their shortcuts ignored. */
  readonly when?: () => boolean
  readonly run: () => unknown
}

/** Per-event context the host derives from the DOM. */
export interface CommandKeyContext {
  /** Event target is inside this registry's scope element. */
  readonly withinScope: boolean
  /** Event target is an editable control. */
  readonly editable: boolean
}

export interface CommandMatch {
  readonly command: CommandDef
  readonly score: number
}

export interface CommandRegistry {
  /** Live list of registered commands, in registration order. */
  readonly commands: Signal<ReadonlyArray<CommandDef>>
  /** The underlying shortcut registry (combo normalisation, conflict detection). */
  readonly shortcuts: ShortcutRegistry
  /** Register one or many commands. Returns a disposer that unregisters them. */
  register(def: CommandDef | ReadonlyArray<CommandDef>): () => void
  unregister(id: string): void
  get(id: string): CommandDef | null
  isAvailable(id: string): boolean
  /** Run a command by id. Resolves false when it is missing or unavailable. */
  execute(id: string): Promise<boolean>
  /** Resolve a keyboard event to an available command, honouring scope and editable rules. */
  resolveKeyboardEvent(event: KeyboardEventLike, context: CommandKeyContext): CommandDef | null
  /**
   * Resolve and run. Calls `event.preventDefault()` when a command handles it.
   * Returns true when handled.
   */
  handleKeyboardEvent(
    event: KeyboardEventLike & { preventDefault?: () => void },
    context: CommandKeyContext,
  ): boolean
  /** Rank available palette commands against a query (empty query → all, in order). */
  search(query: string, options?: { readonly limit?: number }): ReadonlyArray<CommandMatch>
  /** Platform-aware display form of a combo: `⌘K` on macOS, `Ctrl+K` elsewhere. */
  formatShortcut(combo: string): string
  dispose(): void
}

export interface CommandRegistryOptions extends ShortcutRegistryOptions {}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Score how well `query` matches `text` (case-insensitive). 0 means no match.
 * Ordering: exact > prefix > word-start > substring > in-order subsequence.
 * Exported so hosts can rank other palette sources (settings, symbols) the
 * same way as commands.
 */
export function scoreTextMatch(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (q === '') return 1
  const t = text.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - Math.min(t.length - q.length, 100)
  const index = t.indexOf(q)
  if (index > 0) {
    const previous = t[index - 1] ?? ''
    const wordStart = /[\s\-_./:·（(]/.test(previous)
    return (wordStart ? 600 : 400) - Math.min(index, 100)
  }
  // Subsequence: every query char appears in order; penalise gaps.
  let ti = 0
  let gaps = 0
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found === -1) return 0
    gaps += found - ti
    ti = found + 1
  }
  return Math.max(1, 200 - gaps * 5)
}

/** Best score of `query` across several fields. */
export function scoreFields(query: string, fields: ReadonlyArray<string | undefined>): number {
  let best = 0
  for (const field of fields) {
    if (!field) continue
    const score = scoreTextMatch(query, field)
    if (score > best) best = score
  }
  return best
}

function commandShortcuts(def: CommandDef): ReadonlyArray<string> {
  if (def.shortcut === undefined) return []
  return typeof def.shortcut === 'string' ? [def.shortcut] : def.shortcut
}

/** First shortcut combo of a command, if any (for hints). */
export function primaryShortcut(def: CommandDef): string | null {
  return commandShortcuts(def)[0] ?? null
}

function detectMac(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  return /mac|iphone|ipad/i.test(nav?.platform ?? nav?.userAgent ?? '')
}

const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  Mod: '⌘',
  Meta: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  Enter: '↵',
  ' ': 'Space',
}

/** Display a combo for a platform. Exported for tests and non-registry callers. */
export function formatCombo(combo: string, mac: boolean): string {
  const canonical = canonicalCombo(combo).split('+')
  const key = canonical.pop() ?? ''
  const keyLabel = KEY_LABELS[key] ?? key
  if (mac) return canonical.map((m) => MAC_SYMBOLS[m] ?? m).join('') + keyLabel
  return [...canonical.map((m) => (m === 'Mod' ? 'Ctrl' : m)), keyLabel].join('+')
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCommandRegistry(opts?: CommandRegistryOptions): CommandRegistry {
  const mac = opts?.platform !== undefined ? opts.platform === 'mac' : detectMac()
  const shortcuts = createShortcutRegistry({ platform: mac ? 'mac' : 'other', ...opts })
  const byId = new Map<string, CommandDef>()
  const shortcutIds = new Map<string, string[]>()
  const commands = createSignal<ReadonlyArray<CommandDef>>([])
  let disposed = false
  // Context of the keyboard event being resolved; read by shortcut `when` gates.
  let activeContext: CommandKeyContext | null = null

  function publish(): void {
    commands.set([...byId.values()])
  }

  function available(def: CommandDef): boolean {
    try {
      return def.when === undefined || def.when()
    } catch {
      return false
    }
  }

  function keyGate(def: CommandDef): boolean {
    const context = activeContext
    if (context === null) return available(def)
    if (context.editable && !def.allowInEditable) return false
    if (!context.withinScope && (def.scope ?? 'chart') !== 'global') return false
    return available(def)
  }

  function unregister(id: string): void {
    if (disposed) return
    if (!byId.delete(id)) return
    for (const shortcutId of shortcutIds.get(id) ?? []) shortcuts.unregister(shortcutId)
    shortcutIds.delete(id)
    publish()
  }

  function registerOne(def: CommandDef): void {
    if (typeof def.id !== 'string' || def.id === '') {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'CommandRegistry.register: def.id must be a non-empty string',
      )
    }
    if (byId.has(def.id)) unregister(def.id)
    const ids: string[] = []
    try {
      commandShortcuts(def).forEach((combo, index) => {
        parseCombo(combo)
        const shortcutId = index === 0 ? def.id : `${def.id}#${index}`
        shortcuts.register({
          id: shortcutId,
          label: def.title.en,
          combo,
          command: def.id,
          when: () => keyGate(def),
        })
        ids.push(shortcutId)
      })
    } catch (error) {
      for (const shortcutId of ids) shortcuts.unregister(shortcutId)
      throw error
    }
    byId.set(def.id, def)
    shortcutIds.set(def.id, ids)
  }

  function register(def: CommandDef | ReadonlyArray<CommandDef>): () => void {
    if (disposed) return () => {}
    const defs: ReadonlyArray<CommandDef> = Array.isArray(def) ? def : [def as CommandDef]
    for (const one of defs) registerOne(one)
    publish()
    const ids = defs.map((one) => one.id)
    return () => {
      for (const id of ids) {
        // Only remove the registration this disposer created.
        if (defs.some((one) => byId.get(id) === one)) unregister(id)
      }
    }
  }

  function get(id: string): CommandDef | null {
    return byId.get(id) ?? null
  }

  function isAvailable(id: string): boolean {
    const def = byId.get(id)
    return def !== undefined && available(def)
  }

  async function execute(id: string): Promise<boolean> {
    const def = byId.get(id)
    if (def === undefined || !available(def)) return false
    await def.run()
    return true
  }

  function lookup(event: KeyboardEventLike): CommandDef | null {
    const hit = shortcuts.findByKeyboardEvent(event)
    return hit === null ? null : (byId.get(hit.command) ?? null)
  }

  function resolveKeyboardEvent(
    event: KeyboardEventLike,
    context: CommandKeyContext,
  ): CommandDef | null {
    if (disposed) return null
    activeContext = context
    try {
      const direct = lookup(event)
      if (direct !== null) return direct
      // Shifted punctuation (`?`, `/`…) depends on the keyboard layout: a combo
      // registered as plain `?` must match the Shift+/ that produces it.
      if (event.shiftKey && event.key.length === 1 && !/[a-z0-9]/i.test(event.key)) {
        return lookup({ ...pickKeys(event), shiftKey: false })
      }
      return null
    } finally {
      activeContext = null
    }
  }

  function handleKeyboardEvent(
    event: KeyboardEventLike & { preventDefault?: () => void },
    context: CommandKeyContext,
  ): boolean {
    const def = resolveKeyboardEvent(event, context)
    if (def === null) return false
    event.preventDefault?.()
    void Promise.resolve()
      .then(() => def.run())
      .catch((error: unknown) => {
        // Surface the failure to the host's global error handler without breaking the key path.
        queueMicrotask(() => {
          throw error
        })
      })
    return true
  }

  function search(query: string, options?: { readonly limit?: number }): CommandMatch[] {
    const matches: CommandMatch[] = []
    for (const def of byId.values()) {
      if (def.palette === false || !available(def)) continue
      const score = scoreFields(query, [
        def.title.zh,
        def.title.en,
        def.id,
        ...(def.keywords ?? []),
      ])
      if (score > 0) matches.push({ command: def, score })
    }
    // Stable: equal scores keep registration order.
    matches.sort((a, b) => b.score - a.score)
    return options?.limit !== undefined ? matches.slice(0, options.limit) : matches
  }

  function formatShortcut(combo: string): string {
    return formatCombo(combo, mac)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    byId.clear()
    shortcutIds.clear()
    shortcuts.dispose()
    commands.set([])
  }

  return {
    commands,
    shortcuts,
    register,
    unregister,
    get,
    isAvailable,
    execute,
    resolveKeyboardEvent,
    handleKeyboardEvent,
    search,
    formatShortcut,
    dispose,
  }
}

function pickKeys(event: KeyboardEventLike): KeyboardEventLike {
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  }
}
