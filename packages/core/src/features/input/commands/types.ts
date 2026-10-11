/**
 * 命令层对外契约（commands 子模块）。
 *
 * 命令 = 一个具名动作：稳定 id、双语标题、检索关键词、可选快捷键、作用域与
 * 可用性门控，以及真正执行动作的 run。快捷键只是触发命令的一种方式；命令面板、
 * 快捷键表与 Agent 工具复用同一条命令定义，避免各处各写一套。
 *
 * 本文件只放类型，不依赖同模块 impl/。
 */
import type { Signal } from '@/foundation/reactivity/index.js'
import type { KeyboardEventLike, ShortcutRegistry, ShortcutRegistryOptions } from '../keyboard.js'

/** 命令的双语标题（界面双语）。 */
export interface CommandTitle {
  readonly zh: string
  readonly en: string
}

/** 命令标题可选语言。 */
export type CommandLocale = keyof CommandTitle

/**
 * 快捷键作用域：
 * - `chart`（默认）：仅当焦点位于本注册表的 scope 元素内时触发。
 * - `global`：焦点在本图表之外、但本图表是最近活动图表时也可触发（如 ⌘K）。
 */
export type CommandScope = 'chart' | 'global'

/** 一条命令定义。 */
export interface CommandDef {
  /** 稳定点分 id，如 `'drawing.delete'`。 */
  readonly id: string
  readonly title: CommandTitle
  /** 命令面板分组 id，如 `'drawing'` / `'view'` / `'settings'`。 */
  readonly group?: string
  /** 额外检索词（同义词、拼音首字母、英文别名）。 */
  readonly keywords?: ReadonlyArray<string>
  /** 一个或多个 combo 字符串，语法见 `../keyboard.js` 的 parseCombo。 */
  readonly shortcut?: string | ReadonlyArray<string>
  readonly scope?: CommandScope
  /** 允许在 input / textarea / contenteditable 中触发。 */
  readonly allowInEditable?: boolean
  /** 是否出现在命令面板（默认 true）；纯快捷键命令设为 false。 */
  readonly palette?: boolean
  /** 同动作对应的 Agent 工具名（如有）。 */
  readonly tool?: string
  /** 可用性门控：不可用的命令不参与检索，其快捷键也被忽略。 */
  readonly when?: () => boolean
  readonly run: () => unknown
}

/** 宿主按键盘事件从 DOM 派生的上下文。 */
export interface CommandKeyContext {
  /** 事件目标位于本注册表的 scope 元素内。 */
  readonly withinScope: boolean
  /** 事件目标是可编辑控件。 */
  readonly editable: boolean
}

/** 检索结果：命令、匹配得分与当前可用性。 */
export interface CommandMatch {
  readonly command: CommandDef
  readonly score: number
  /** 当前 `when()` 是否通过；不可用的命令仍列出，但调用方应禁用。 */
  readonly available: boolean
}

/** 命令注册表：命令定义 + 快捷键匹配 + 检索。 */
export interface CommandRegistry {
  /** 当前已注册命令（注册顺序）的实时列表。 */
  readonly commands: Signal<ReadonlyArray<CommandDef>>
  /** 底层快捷键注册表（combo 归一化、冲突检测）。 */
  readonly shortcuts: ShortcutRegistry
  /** 注册一条或多条命令，返回注销它们的 disposer。 */
  register(def: CommandDef | ReadonlyArray<CommandDef>): () => void
  unregister(id: string): void
  get(id: string): CommandDef | null
  /** 修改命令快捷键；传 null 清除快捷键，冲突时抛出错误并保留原绑定。 */
  setShortcut(id: string, shortcut: string | ReadonlyArray<string> | null): void
  isAvailable(id: string): boolean
  /** 按 id 执行；命令缺失或不可用时返回 false。 */
  execute(id: string): Promise<boolean>
  /** 把键盘事件解析为可用命令，遵循 scope 与可编辑规则。 */
  resolveKeyboardEvent(event: KeyboardEventLike, context: CommandKeyContext): CommandDef | null
  /** 解析并执行；命中时调用 event.preventDefault()，返回是否已处理。 */
  handleKeyboardEvent(
    event: KeyboardEventLike & { preventDefault?: () => void },
    context: CommandKeyContext,
  ): boolean
  /** 对可用命令按查询排名（空查询返回全部，按注册顺序）。 */
  search(query: string, options?: { readonly limit?: number }): ReadonlyArray<CommandMatch>
  /** combo 的平台化展示：macOS 为 `⌘K`，其余为 `Ctrl+K`。 */
  formatShortcut(combo: string): string
  dispose(): void
}

/** 命令注册表选项，透传快捷键注册表选项。 */
export interface CommandRegistryOptions extends ShortcutRegistryOptions {}
