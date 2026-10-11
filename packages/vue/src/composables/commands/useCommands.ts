/**
 * Vue 侧命令层：每张图表一个 Core CommandRegistry，页面只装一个 keydown 桥。
 *
 * - 作用域：快捷键默认只在焦点位于该图表根元素内时生效（避免多图表同时响应
 *   Delete）；scope: 'global' 的命令（⌘K、?）在焦点不属于任何图表时，交给最近
 *   一次被聚焦/点击的图表。
 * - 文本输入：除 allowInEditable 的命令外，在 input / textarea / contenteditable
 *   中不触发。
 * - 页面级 document 监听按引用计数挂载与卸载，多个图表共享同一个监听。
 *
 * 这里只做 DOM 桥与 provide/inject，不含任何命令目录；命令由各组件通过
 * useRegisterCommands 注册。
 */
import {
  type CommandDef,
  type CommandRegistry,
  createCommandRegistry,
} from '@363045841yyt/klinechart-core'
import {
  type ComputedRef,
  computed,
  type InjectionKey,
  inject,
  onScopeDispose,
  provide,
  type Ref,
  shallowRef,
  watch,
} from 'vue'

/** 当前图表命令注册表的注入键；KLineChart 提供，子组件注入。 */
const KLC_COMMANDS_KEY: InjectionKey<CommandRegistry> = Symbol('klc-commands')

interface CommandScopeEntry {
  readonly registry: CommandRegistry
  /** 返回该图表的根元素；快捷键作用域判定用。 */
  readonly root: () => HTMLElement | null
}

const scopes = new Set<CommandScopeEntry>()
let lastActive: CommandScopeEntry | null = null
let documentListeners = 0

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'

/**
 * 事件目标是否为可编辑控件。
 *
 * @param target - 键盘事件目标
 * @returns 目标位于可编辑控件内为 true
 */
function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null
}

/** 找到包含事件目标的图表作用域；都不包含返回 null。 */
function scopeOf(target: EventTarget | null): CommandScopeEntry | null {
  if (!(target instanceof Node)) return null
  for (const entry of scopes) {
    if (entry.root()?.contains(target)) return entry
  }
  return null
}

/** 页面级 keydown 处理：按焦点定位所属图表，否则交给最近活动图表。 */
function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return
  const owner = scopeOf(event.target)
  const entry = owner ?? lastActive
  if (!entry || !scopes.has(entry)) return
  entry.registry.handleKeyboardEvent(event, {
    withinScope: owner !== null,
    editable: isEditableTarget(event.target),
  })
}

/** 记录最近一次被聚焦/点击的图表，供 global 命令路由。 */
function onDocumentActivate(event: Event): void {
  const owner = scopeOf(event.target)
  if (owner) lastActive = owner
}

/** 挂载页面级监听；引用计数为 0 时真正安装。 */
function attachDocument(): void {
  if (typeof document === 'undefined') return
  if (documentListeners++ > 0) return
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('focusin', onDocumentActivate, true)
  document.addEventListener('pointerdown', onDocumentActivate, true)
}

/** 卸载页面级监听；引用计数归零时真正移除。 */
function detachDocument(): void {
  if (typeof document === 'undefined') return
  if (--documentListeners > 0) return
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('focusin', onDocumentActivate, true)
  document.removeEventListener('pointerdown', onDocumentActivate, true)
}

/**
 * 创建并提供某张图表的命令注册表，并绑定 root 元素作为快捷键作用域。
 *
 * @param root - 图表根元素（快捷键作用域）
 * @returns 该图表的命令注册表
 */
export function provideChartCommands(root: Ref<HTMLElement | null>): CommandRegistry {
  const registry = createCommandRegistry()
  const entry: CommandScopeEntry = { registry, root: () => root.value }
  scopes.add(entry)
  // 第一张挂载的图表默认作为 global 命令目标，直到用户聚焦其他图表。
  lastActive ??= entry
  attachDocument()
  provide(KLC_COMMANDS_KEY, registry)
  onScopeDispose(() => {
    scopes.delete(entry)
    if (lastActive === entry) lastActive = scopes.values().next().value ?? null
    detachDocument()
    registry.dispose()
  })
  return registry
}

/**
 * 注入最近的图表命令注册表。
 *
 * @returns 命令注册表；不在图表子树中返回 null
 */
export function injectCommands(): CommandRegistry | null {
  return inject(KLC_COMMANDS_KEY, null)
}

/**
 * 在组件生命周期内注册命令；defs 变化时重新注册，组件卸载时自动注销。
 *
 * @param registry - 命令注册表
 * @param defs - 命令定义（getter，以便依赖响应式数据）
 */
export function useRegisterCommands(
  registry: CommandRegistry | null,
  defs: () => ReadonlyArray<CommandDef>,
): void {
  if (!registry) return
  watch(
    defs,
    (next, _previous, onCleanup) => {
      onCleanup(registry.register(next))
    },
    { immediate: true },
  )
}

/**
 * 把注册表的命令列表接入 Vue 响应式。
 *
 * @param registry - 命令注册表
 * @returns 命令列表的只读计算值
 */
export function useCommandList(
  registry: CommandRegistry | null,
): ComputedRef<ReadonlyArray<CommandDef>> {
  const list = shallowRef<ReadonlyArray<CommandDef>>(registry?.commands.peek() ?? [])
  if (registry) {
    const unsubscribe = registry.commands.subscribe(() => {
      list.value = registry.commands.peek()
    })
    onScopeDispose(unsubscribe)
  }
  return computed(() => list.value)
}

/** 测试辅助：重置页面级作用域状态。 */
export function __resetCommandScopesForTest(): void {
  scopes.clear()
  lastActive = null
}
