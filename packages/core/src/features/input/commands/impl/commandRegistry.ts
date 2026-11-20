/**
 * 命令注册表实现：在 {@link createShortcutRegistry} 之上把“具名命令”与快捷键、
 * 检索、作用域门控串起来。
 *
 * 每条命令的每个 shortcut 会登记到底层快捷键注册表，command 字段指回命令 id，
 * 于是按键 → shortcut → 命令。scope / allowInEditable / when 的门控在匹配时读取
 * 当前键盘事件上下文（activeContext）判断，作用域与可编辑规则不进入底层注册表。
 *
 * 纯数据：不访问 DOM。宿主负责决定命令作用域元素，并在每次键盘事件上报焦点是否
 * 在作用域内、目标是否可编辑。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { asReadonlySignal, batch, createSignal } from '@/foundation/reactivity/index.js'
import { createShortcutRegistry, type KeyboardEventLike, type ShortcutDef } from '../../keyboard.js'
import type {
  CommandDef,
  CommandKeyContext,
  CommandMatch,
  CommandRegistry,
  CommandRegistryOptions,
} from '../types.js'
import { detectMac, formatCombo, scoreFields } from './matching.js'

/** 取命令声明的全部快捷键 combo。 */
function commandShortcuts(def: CommandDef): ReadonlyArray<string> {
  if (def.shortcut === undefined) return []
  return typeof def.shortcut === 'string' ? [def.shortcut] : def.shortcut
}

/** 提取 KeyboardEventLike 的按键字段，用于构造变体事件。 */
function pickKeys(event: KeyboardEventLike): KeyboardEventLike {
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    code: event.code,
  }
}

/**
 * 创建命令注册表。
 *
 * @param opts - 平台等选项，透传底层快捷键注册表
 * @returns 命令注册表
 */
export function createCommandRegistry(opts?: CommandRegistryOptions): CommandRegistry {
  const mac = opts?.platform !== undefined ? opts.platform === 'mac' : detectMac()
  const createBindings = () => createShortcutRegistry({ platform: mac ? 'mac' : 'other' })
  let bindings = createBindings()
  let byId = new Map<string, CommandDef>()
  const commands = createSignal<readonly CommandDef[]>(Object.freeze([]))
  const shortcuts = createSignal<readonly ShortcutDef[]>(Object.freeze([]))
  const registrations = new WeakMap<CommandDef, object>()
  let disposed = false
  // 正在解析的键盘事件上下文；供快捷键的 when 门控读取。
  let activeContext: CommandKeyContext | null = null

  function reportFailure(error: unknown, commandId?: string): void {
    if (opts?.onError) opts.onError(error, commandId)
    else console.error('[CommandRegistry] Keyboard command failed', commandId, error)
  }

  const available = (def: CommandDef): boolean => def.when?.() ?? true

  /** 快捷键门控：结合当前事件上下文与命令可用性。 */
  function keyGate(def: CommandDef): boolean {
    const context = activeContext
    if (context === null) return available(def)
    if (context.editable && !def.allowInEditable) return false
    if (!context.withinScope && (def.scope ?? 'chart') !== 'global') return false
    return available(def)
  }

  function unregister(id: string): void {
    if (disposed) return
    const next = new Map(byId)
    if (next.delete(id)) commit(next)
  }

  function snapshot(def: CommandDef, registration: object): CommandDef {
    if (typeof def.id !== 'string' || def.id === '') {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'CommandRegistry.register: def.id must be a non-empty string',
      )
    }
    const value = Object.freeze({
      ...def,
      title: Object.freeze({ ...def.title }),
      keywords: def.keywords && Object.freeze([...def.keywords]),
      shortcut:
        typeof def.shortcut === 'string' || def.shortcut === undefined
          ? def.shortcut
          : Object.freeze([...def.shortcut]),
    })
    registrations.set(value, registration)
    return value
  }

  /** 校验整套绑定后才发布，同一批通知可以读取命令和快捷键。 */
  function commit(next: Map<string, CommandDef>): void {
    const candidate = createBindings()
    let id = 0
    for (const def of next.values()) {
      for (const combo of commandShortcuts(def)) {
        candidate.register({
          id: String(id++),
          label: def.title.en,
          combo,
          command: def.id,
          when: () => keyGate(def),
        })
      }
    }
    bindings = candidate
    byId = next
    batch(() => {
      shortcuts.set(bindings.shortcuts.peek())
      commands.set(Object.freeze([...byId.values()]))
    })
  }

  function register(def: CommandDef | ReadonlyArray<CommandDef>): () => void {
    if (disposed) return () => {}
    const defs: ReadonlyArray<CommandDef> = Array.isArray(def) ? def : [def as CommandDef]
    const registration = {}
    const registered = defs.map((definition) => snapshot(definition, registration))
    const next = new Map(byId)
    for (const one of registered) {
      next.delete(one.id)
      next.set(one.id, one)
    }
    commit(next)
    return () => {
      if (disposed) return
      const remaining = new Map(byId)
      for (const one of registered) {
        const current = remaining.get(one.id)
        if (current && registrations.get(current) === registration) remaining.delete(one.id)
      }
      if (remaining.size !== byId.size) commit(remaining)
    }
  }

  function get(id: string): CommandDef | null {
    return byId.get(id) ?? null
  }

  function setShortcut(id: string, shortcut: string | ReadonlyArray<string> | null): void {
    const current = byId.get(id)
    if (current === undefined) return
    const next = new Map(byId)
    next.set(
      id,
      snapshot({ ...current, shortcut: shortcut ?? undefined }, registrations.get(current)!),
    )
    commit(next)
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
    const hit = bindings.findByKeyboardEvent(event)
    return hit === null ? null : (byId.get(hit.command) ?? null)
  }

  function resolveKeyboardEvent(
    event: KeyboardEventLike,
    context: CommandKeyContext,
  ): CommandDef | null {
    if (disposed) return null
    const previousContext = activeContext
    activeContext = context
    try {
      const direct = lookup(event)
      if (direct !== null) return direct
      // Shifted 标点（?、/ 等）随键盘布局变化：注册为普通 `?` 的 combo
      // 必须匹配产生它的 Shift+/。
      if (event.shiftKey && event.key.length === 1 && !/[a-z0-9]/i.test(event.key)) {
        return lookup({ ...pickKeys(event), shiftKey: false })
      }
      return null
    } finally {
      activeContext = previousContext
    }
  }

  function handleKeyboardEvent(
    event: KeyboardEventLike & { preventDefault?: () => void },
    context: CommandKeyContext,
  ): boolean {
    let def: CommandDef | null
    try {
      def = resolveKeyboardEvent(event, context)
    } catch (error) {
      reportFailure(error)
      return false
    }
    if (def === null) return false
    event.preventDefault?.()
    void Promise.resolve()
      .then(() => def.run())
      .catch((error: unknown) => reportFailure(error, def.id))
    return true
  }

  function search(query: string, options?: { readonly limit?: number }): CommandMatch[] {
    const matches: CommandMatch[] = []
    for (const def of byId.values()) {
      if (def.palette === false) continue
      const score = scoreFields(query, [
        def.title.zh,
        def.title.en,
        def.id,
        ...(def.keywords ?? []),
        ...commandShortcuts(def).map((shortcut) => formatCombo(shortcut, mac)),
      ])
      if (score > 0) matches.push({ command: def, score, available: available(def) })
    }
    // 稳定排序：同分保持注册顺序。
    matches.sort((a, b) => b.score - a.score)
    return options?.limit !== undefined ? matches.slice(0, options.limit) : matches
  }

  function formatShortcut(combo: string): string {
    return formatCombo(combo, mac)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    commit(new Map())
  }

  return {
    commands: asReadonlySignal(commands),
    shortcuts: {
      shortcuts: asReadonlySignal(shortcuts),
      canonical: (combo) => bindings.canonical(combo),
      findByCombo: (combo) => bindings.findByCombo(combo),
      findByKeyboardEvent: (event) => bindings.findByKeyboardEvent(event),
    },
    register,
    unregister,
    get,
    setShortcut,
    isAvailable,
    execute,
    resolveKeyboardEvent,
    handleKeyboardEvent,
    search,
    formatShortcut,
    dispose,
  }
}
