/**
 * Vue 侧命令层：每个图表实例一个 Core CommandRegistry，一个页面级 keydown 桥。
 *
 * - 作用域：快捷键默认只在焦点位于该图表根元素内时生效（修复多图表同时响应 Delete 的问题）；
 *   scope: 'global' 的命令（⌘K、?）在焦点不属于任何图表时，交给最近一次被聚焦/点击的图表。
 * - 文本输入：除 allowInEditable 的命令外，在 input / textarea / contenteditable 中不触发。
 * - 页面只安装一个 document 监听，按引用计数挂载与卸载。
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

export const KLC_COMMANDS_KEY: InjectionKey<CommandRegistry> = Symbol('klc-commands')

interface CommandScopeEntry {
  readonly registry: CommandRegistry
  readonly root: () => HTMLElement | null
}

const scopes = new Set<CommandScopeEntry>()
let lastActive: CommandScopeEntry | null = null
let documentListeners = 0

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'

/** 事件目标是否为可编辑控件。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null
}

function scopeOf(target: EventTarget | null): CommandScopeEntry | null {
  if (!(target instanceof Node)) return null
  for (const entry of scopes) {
    if (entry.root()?.contains(target)) return entry
  }
  return null
}

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

function onDocumentActivate(event: Event): void {
  const owner = scopeOf(event.target)
  if (owner) lastActive = owner
}

function attachDocument(): void {
  if (typeof document === 'undefined') return
  if (documentListeners++ > 0) return
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('focusin', onDocumentActivate, true)
  document.addEventListener('pointerdown', onDocumentActivate, true)
}

function detachDocument(): void {
  if (typeof document === 'undefined') return
  if (--documentListeners > 0) return
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('focusin', onDocumentActivate, true)
  document.removeEventListener('pointerdown', onDocumentActivate, true)
}

/**
 * 创建并提供某个图表的命令注册表，并把它绑定到 root 元素作为快捷键作用域。
 *
 * @param root - 图表根元素（快捷键作用域）
 */
export function provideChartCommands(root: Ref<HTMLElement | null>): CommandRegistry {
  const registry = createCommandRegistry()
  const entry: CommandScopeEntry = { registry, root: () => root.value }
  scopes.add(entry)
  // 第一个挂载的图表默认作为 global 命令的目标，直到用户聚焦其他图表。
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

/** 注入最近的图表命令注册表；不在图表子树中返回 null。 */
export function injectCommands(): CommandRegistry | null {
  return inject(KLC_COMMANDS_KEY, null)
}

/**
 * 在组件生命周期内注册命令；defs 变化时重新注册，组件卸载时自动注销。
 *
 * @param registry - 命令注册表
 * @param defs - 命令定义（可为 getter，以便依赖响应式数据）
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

/** 把注册表的命令列表接入 Vue 响应式。 */
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
