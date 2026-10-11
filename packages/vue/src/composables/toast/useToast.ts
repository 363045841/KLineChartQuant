/**
 * Toast + Undo 服务。
 *
 * 用法：
 * ```ts
 * const toast = useToast()
 * toast.show({ message: '已复制' })
 * toast.showUndo({
 *   message: '已恢复默认颜色',
 *   onUndo: () => applyColors(previous),
 * })
 * ```
 *
 * 设计要点（对齐 NN/g「优先 Undo，而非确认」与 Vercel Web Interface Guidelines）：
 * - 视图层 `<ToastViewport>` 渲染一个 `aria-live="polite"` 区域；悬停或聚焦时暂停计时，
 *   页面不可见时也暂停，避免用户还没看到就过期。
 * - 同一 store 可挂多个视口；后挂载者优先（如打开的模态 dialog 内部的视口），
 *   保证模态打开时 Undo 按钮仍可点击（dialog 外的内容是 inert）。
 * - `onDismiss(reason)` 让调用方实现「延迟提交」：reason 不是 `'action'` 时再真正执行。
 * - 未调用 `provideToast()` 时使用模块级默认 store，库内组件与宿主共享同一队列。
 */
import {
  getCurrentInstance,
  hasInjectionContext,
  type InjectionKey,
  inject,
  onScopeDispose,
  provide,
  type Ref,
  readonly,
  ref,
  shallowReactive,
  shallowRef,
} from 'vue'

export type ToastTone = 'neutral' | 'success' | 'danger'

/** 关闭原因：timeout 计时结束；action 用户点击动作；close 用户关闭；replaced 被同 id 或超额挤出；cleared 清空/页面卸载。 */
export type ToastDismissReason = 'timeout' | 'action' | 'close' | 'replaced' | 'cleared'

export interface ToastAction {
  label: string
  onAction: () => void | Promise<void>
}

export interface ToastOptions {
  /** 相同 id 的新 toast 会替换旧的（旧的以 replaced 关闭）。 */
  id?: string
  message: string
  description?: string
  tone?: ToastTone
  action?: ToastAction
  /** 显示时长（ms）。<=0 或 Infinity 表示常驻直到用户关闭。默认 5000，有 action 时 8000。 */
  timeout?: number
  onDismiss?: (reason: ToastDismissReason) => void
}

export interface UndoToastOptions {
  id?: string
  message: string
  description?: string
  /** 默认「撤销」。 */
  undoLabel?: string
  timeout?: number
  /** 用户点击撤销。 */
  onUndo: () => void | Promise<void>
  /** 未撤销而关闭时调用；用于延迟提交的破坏性操作。 */
  onCommit?: () => void | Promise<void>
}

export interface ToastItem {
  readonly id: string
  readonly message: string
  readonly description?: string
  readonly tone: ToastTone
  readonly action?: ToastAction
  readonly timeout: number
}

export interface ToastHandle {
  readonly id: string
  dismiss(): void
}

export interface ToastApi {
  /** 当前可见的 toast（最新在后）。 */
  readonly toasts: Readonly<Ref<ReadonlyArray<ToastItem>>>
  show(options: ToastOptions): ToastHandle
  showUndo(options: UndoToastOptions): ToastHandle
  dismiss(id: string, reason?: ToastDismissReason): void
  /** 关闭全部；默认原因 cleared（延迟提交的操作会被提交）。 */
  clear(reason?: ToastDismissReason): void
}

export interface ToastStore extends ToastApi {
  /** 暂停/恢复全部计时（视口悬停、聚焦、页面隐藏时使用）。 */
  pause(source: string): void
  resume(source: string): void
  /** 视口登记；返回值为注销函数。最后登记的视口负责渲染。 */
  registerViewport(token: symbol): () => void
  readonly activeViewport: Readonly<Ref<symbol | null>>
}

export interface CreateToastStoreOptions {
  /** 同时可见的最大数量，默认 3；超出时最旧的以 replaced 关闭。 */
  max?: number
  defaultTimeout?: number
  actionTimeout?: number
  undoLabel?: string
}

interface TimerState {
  remaining: number
  startedAt: number
  handle: ReturnType<typeof setTimeout> | undefined
  onDismiss?: (reason: ToastDismissReason) => void
}

let idSeed = 0

export function createToastStore(storeOptions: CreateToastStoreOptions = {}): ToastStore {
  const max = storeOptions.max ?? 3
  const defaultTimeout = storeOptions.defaultTimeout ?? 5000
  const actionTimeout = storeOptions.actionTimeout ?? 8000
  const undoLabel = storeOptions.undoLabel ?? '撤销'

  const toasts = shallowRef<ReadonlyArray<ToastItem>>([])
  const timers = new Map<string, TimerState>()
  const pauseSources = shallowReactive(new Set<string>())
  const viewports = ref<symbol[]>([])
  const activeViewport = shallowRef<symbol | null>(null)

  const isPaused = () => pauseSources.size > 0

  function arm(id: string): void {
    const timer = timers.get(id)
    if (!timer || !Number.isFinite(timer.remaining) || timer.remaining <= 0) return
    clearTimeout(timer.handle)
    timer.startedAt = Date.now()
    timer.handle = setTimeout(() => dismiss(id, 'timeout'), timer.remaining)
  }

  function disarm(id: string): void {
    const timer = timers.get(id)
    if (!timer || timer.handle === undefined) return
    clearTimeout(timer.handle)
    timer.handle = undefined
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
  }

  function dismiss(id: string, reason: ToastDismissReason = 'close'): void {
    const timer = timers.get(id)
    if (!timer) return
    clearTimeout(timer.handle)
    timers.delete(id)
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
    timer.onDismiss?.(reason)
  }

  function show(options: ToastOptions): ToastHandle {
    const id = options.id ?? `klc-toast-${++idSeed}`
    if (timers.has(id)) dismiss(id, 'replaced')
    const requested = options.timeout ?? (options.action ? actionTimeout : defaultTimeout)
    const timeout = Number.isFinite(requested) && requested > 0 ? requested : Infinity
    const item: ToastItem = {
      id,
      message: options.message,
      description: options.description,
      tone: options.tone ?? 'neutral',
      action: options.action,
      timeout,
    }
    timers.set(id, {
      remaining: timeout,
      startedAt: Date.now(),
      handle: undefined,
      onDismiss: options.onDismiss,
    })
    toasts.value = [...toasts.value, item]
    while (toasts.value.length > max) {
      const oldest = toasts.value[0]
      if (!oldest) break
      dismiss(oldest.id, 'replaced')
    }
    if (!isPaused()) arm(id)
    return { id, dismiss: () => dismiss(id, 'close') }
  }

  function showUndo(options: UndoToastOptions): ToastHandle {
    return show({
      id: options.id,
      message: options.message,
      description: options.description,
      timeout: options.timeout,
      action: { label: options.undoLabel ?? undoLabel, onAction: options.onUndo },
      onDismiss: (reason) => {
        if (reason !== 'action') void options.onCommit?.()
      },
    })
  }

  function clear(reason: ToastDismissReason = 'cleared'): void {
    for (const toast of [...toasts.value]) dismiss(toast.id, reason)
  }

  function pause(source: string): void {
    const wasPaused = isPaused()
    pauseSources.add(source)
    if (!wasPaused) for (const id of timers.keys()) disarm(id)
  }

  function resume(source: string): void {
    if (!pauseSources.delete(source) || isPaused()) return
    for (const id of timers.keys()) arm(id)
  }

  function registerViewport(token: symbol): () => void {
    viewports.value = [...viewports.value, token]
    activeViewport.value = token
    return () => {
      viewports.value = viewports.value.filter((entry) => entry !== token)
      activeViewport.value = viewports.value.at(-1) ?? null
    }
  }

  return {
    toasts: readonly(toasts) as Readonly<Ref<ReadonlyArray<ToastItem>>>,
    activeViewport: readonly(activeViewport) as Readonly<Ref<symbol | null>>,
    show,
    showUndo,
    dismiss,
    clear,
    pause,
    resume,
    registerViewport,
  }
}

export const TOAST_STORE_KEY: InjectionKey<ToastStore> = Symbol('klc-toast-store')

let defaultStore: ToastStore | null = null

/** 模块级默认 store：页面隐藏时暂停，页面卸载时提交延迟操作。 */
function getDefaultToastStore(): ToastStore {
  if (defaultStore) return defaultStore
  const store = createToastStore()
  defaultStore = store
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') store.pause('document-hidden')
      else store.resume('document-hidden')
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => store.clear('cleared'))
  }
  return store
}

/** 在子树内提供独立的 toast store（默认无需调用）。 */
export function provideToast(store: ToastStore = createToastStore()): ToastStore {
  provide(TOAST_STORE_KEY, store)
  const instance = getCurrentInstance()
  if (instance) localStores.set(instance, store)
  const visibility = () => {
    if (document.visibilityState === 'hidden') store.pause('document-hidden')
    else store.resume('document-hidden')
  }
  const pagehide = () => store.clear('cleared')
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', visibility)
    visibility()
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', pagehide)
  onScopeDispose(() => {
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', visibility)
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', pagehide)
    store.clear('cleared')
    if (instance) localStores.delete(instance)
  })
  return store
}

const localStores = new WeakMap<object, ToastStore>()

/** 内部：取当前 store（含视口登记能力）。 */
export function useToastStore(): ToastStore {
  const instance = getCurrentInstance()
  const local = instance ? localStores.get(instance) : undefined
  if (local) return local
  return (hasInjectionContext() ? inject(TOAST_STORE_KEY, null) : null) ?? getDefaultToastStore()
}

/** 获取 toast API。可在 setup 外调用（回落到默认 store）。 */
export function useToast(): ToastApi {
  const store = useToastStore()
  return {
    toasts: store.toasts,
    show: store.show,
    showUndo: store.showUndo,
    dismiss: store.dismiss,
    clear: store.clear,
  }
}
