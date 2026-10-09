/**
 * Undo 提示的适配接口（ADR 0006：恢复默认后必须提供撤销）。
 *
 * 形状与共享 Toast 原语 `useToast().show({ message, action: { label, onAction }, timeout })`
 * 一致。宿主或 Toast 原语通过 `provideToast()` 注入实现；未注入时调用方使用
 * `createInlineToast()` 在自身界面内渲染一个 aria-live 提示，功能不缺失。
 */
import { type InjectionKey, inject, provide, type Ref, readonly, ref } from 'vue'

export interface KlcToastAction {
  readonly label: string
  readonly onAction: () => void
}

export interface KlcToastOptions {
  readonly message: string
  readonly action?: KlcToastAction
  /** 自动关闭毫秒数；默认 6000。 */
  readonly timeout?: number
}

export interface KlcToastApi {
  show(options: KlcToastOptions): void
}

export const KLC_TOAST_KEY: InjectionKey<KlcToastApi> = Symbol('klc-toast')

/** 注入 Toast 实现（例如共享 Toast 原语的 useToast()）。 */
export function provideToast(api: KlcToastApi): void {
  provide(KLC_TOAST_KEY, api)
}

/** 读取已注入的 Toast 实现；未注入返回 null。 */
export function injectToast(): KlcToastApi | null {
  return inject(KLC_TOAST_KEY, null)
}

export const DEFAULT_TOAST_TIMEOUT_MS = 6000

/** 组件内联 Toast：单条、可撤销、到时自动消失。 */
export interface InlineToast extends KlcToastApi {
  readonly current: Readonly<Ref<KlcToastOptions | null>>
  dismiss(): void
  /** 执行当前 action 并关闭。 */
  act(): void
}

export function createInlineToast(): InlineToast {
  const current = ref<KlcToastOptions | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function dismiss(): void {
    clearTimer()
    current.value = null
  }

  return {
    current: readonly(current) as Readonly<Ref<KlcToastOptions | null>>,
    show(options) {
      clearTimer()
      current.value = options
      timer = setTimeout(dismiss, options.timeout ?? DEFAULT_TOAST_TIMEOUT_MS)
    },
    dismiss,
    act() {
      const action = current.value?.action
      dismiss()
      action?.onAction()
    },
  }
}
