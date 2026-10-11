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
import { createSignal } from '@/foundation/reactivity/index.js'
import { createShortcutRegistry, type KeyboardEventLike, parseCombo } from '../../keyboard.js'
import type {
  CommandDef,
  CommandKeyContext,
  CommandMatch,
  CommandRegistry,
  CommandRegistryOptions,
} from '../types.js'
import { formatCombo, scoreFields } from './matching.js'

/** 取命令声明的全部快捷键 combo。 */
function commandShortcuts(def: CommandDef): ReadonlyArray<string> {
  if (def.shortcut === undefined) return []
  return typeof def.shortcut === 'string' ? [def.shortcut] : def.shortcut
}

/** 从 navigator 嗅探是否 macOS。 */
function detectMac(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  return /mac|iphone|ipad/i.test(nav?.platform ?? nav?.userAgent ?? '')
}

/** 提取 KeyboardEventLike 的按键字段，用于构造变体事件。 */
function pickKeys(event: KeyboardEventLike): KeyboardEventLike {
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
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
  const shortcuts = createShortcutRegistry({ platform: mac ? 'mac' : 'other', ...opts })
  const byId = new Map<string, CommandDef>()
  const shortcutIds = new Map<string, string[]>()
  const commands = createSignal<ReadonlyArray<CommandDef>>([])
  let disposed = false
  // 正在解析的键盘事件上下文；供快捷键的 when 门控读取。
  let activeContext: CommandKeyContext | null = null

  function publish(): void {
    commands.set([...byId.values()])
  }

  /** 命令当前是否可用；when 抛错视为不可用。 */
  function available(def: CommandDef): boolean {
    try {
      return def.when === undefined || def.when()
    } catch {
      return false
    }
  }

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
    if (!byId.delete(id)) return
    for (const shortcutId of shortcutIds.get(id) ?? []) shortcuts.unregister(shortcutId)
    shortcutIds.delete(id)
    publish()
  }

  /** 登记单条命令；快捷键登记失败时回滚，避免留下半绑定。 */
  function registerOne(def: CommandDef, preserveOrder = false): void {
    if (typeof def.id !== 'string' || def.id === '') {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'CommandRegistry.register: def.id must be a non-empty string',
      )
    }
    if (byId.has(def.id) && !preserveOrder) unregister(def.id)
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
    const done: CommandDef[] = []
    try {
      for (const one of defs) {
        registerOne(one)
        done.push(one)
      }
    } catch (error) {
      // 整批注册失败时回滚已登记的命令，保证一次 register 调用是原子的。
      for (const one of done) unregister(one.id)
      throw error
    }
    publish()
    const ids = defs.map((one) => one.id)
    return () => {
      for (const id of ids) {
        // 只移除本 disposer 创建的那次注册。
        if (defs.some((one) => byId.get(id) === one)) unregister(id)
      }
    }
  }

  function get(id: string): CommandDef | null {
    return byId.get(id) ?? null
  }

  function setShortcut(id: string, shortcut: string | ReadonlyArray<string> | null): void {
    const current = byId.get(id)
    if (current === undefined) return
    const next: CommandDef = { ...current, shortcut: shortcut ?? undefined }
    // 只移除快捷键绑定，保留 byId 的 Map 插入位置，避免编辑快捷键后命令顺序改变。
    for (const shortcutId of shortcutIds.get(id) ?? []) shortcuts.unregister(shortcutId)
    shortcutIds.delete(id)
    try {
      registerOne(next, true)
      publish()
    } catch (error) {
      registerOne(current, true)
      publish()
      throw error
    }
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
      // Shifted 标点（?、/ 等）随键盘布局变化：注册为普通 `?` 的 combo
      // 必须匹配产生它的 Shift+/。
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
        // 把失败交给宿主的全局错误处理，不打断按键路径。
        queueMicrotask(() => {
          throw error
        })
      })
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
