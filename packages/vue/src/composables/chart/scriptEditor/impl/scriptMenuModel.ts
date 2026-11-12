/**
 * 脚本右键菜单的状态机：动作、表单、预览与异步失效收在这里，渲染交给
 * ScriptContextMenu（DropMenu 坐标模式）。不创建 DOM，也不排渲染时序。
 */
import { type ShallowRef, shallowRef } from 'vue'
import { errorText } from './errorText.js'

/** 单个菜单项的可选展示与禁用原因。 */
export interface ScriptMenuItem {
  readonly shortcut?: string
  readonly disabled?: boolean
  readonly reason?: string
}

/** 菜单项条目：id 用于稳定渲染与执行回调。 */
export interface ScriptMenuEntry {
  readonly id: string
  readonly label: string
  readonly shortcut?: string
  readonly disabled: boolean
  readonly reason?: string
  readonly separatorBefore: boolean
}

/** 外部声明的只读预览内容；由子组件创建 CodeMirror 视图。 */
export interface ScriptMenuPreview {
  readonly path: string
  readonly source: string
  readonly from: number
  readonly to: number
}

interface InputOptions {
  label: string
  value: string
  submit: (value: string) => void | Promise<void>
  validate?: (value: string) => string | null
}

interface ConfirmOptions {
  text: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
}

export type ScriptMenuContent =
  | { readonly kind: 'menu'; readonly items: ReadonlyArray<ScriptMenuEntry> }
  | { readonly kind: 'message'; readonly text: string }
  | {
      readonly kind: 'input'
      readonly label: string
      readonly value: string
      readonly error: string | null
      readonly running: boolean
    }
  | {
      readonly kind: 'confirm'
      readonly text: string
      readonly confirmLabel: string
      readonly error: string | null
      readonly running: boolean
    }
  | { readonly kind: 'preview'; readonly preview: ScriptMenuPreview }

export interface ScriptMenuState {
  readonly x: number
  readonly y: number
  readonly role: 'menu' | 'dialog'
  readonly label: string
  readonly content: ScriptMenuContent
  readonly returnFocus: HTMLElement | null
}

export interface ScriptMenuOpenOptions {
  readonly role?: 'menu' | 'dialog'
  readonly label?: string
}

/** 菜单模型：保留命令式调用方式，状态由 Vue 组件订阅。 */
export interface ScriptMenuModel {
  readonly state: Readonly<ShallowRef<ScriptMenuState | null>>
  /** 单调递增的菜单版本；异步操作据此判断结果是否过期。 */
  readonly generation: number
  readonly isOpen: boolean
  readonly mode: 'menu' | 'dialog' | null
  /** 当前面板元素，供快捷键忽略菜单内部事件。 */
  readonly panelElement: ShallowRef<HTMLElement | null>
  open(x: number, y: number, options?: ScriptMenuOpenOptions): void
  close(): void
  /** 由组件在面板自行关闭时调用，不重复处理焦点。 */
  handleUiClose(): void
  clear(): void
  message(text: string): void
  button(label: string, action: () => void | Promise<void>, item?: ScriptMenuItem): void
  separator(): void
  input(options: InputOptions): void
  confirm(options: ConfirmOptions): void
  preview(preview: ScriptMenuPreview): void
  run(id: string): Promise<void>
  submitInput(value: string): Promise<void>
  confirmAction(): Promise<void>
  destroy(): void
}

/** 判断快捷键展示与 Mod 含义是否使用 Mac 平台。 */
export function isMacPlatform(ownerDocument: Document): boolean {
  return /Mac|iPhone|iPad/.test(ownerDocument.defaultView?.navigator.platform ?? '')
}

/** 把 `Mod` 换成当前平台的修饰键文本，避免 Windows 上直接显示 Mod。 */
function formatShortcut(shortcut: string): string {
  return shortcut.replace('Mod', isMacPlatform(document) ? '⌘' : 'Ctrl')
}

export function createScriptMenuModel(): ScriptMenuModel {
  const state = shallowRef<ScriptMenuState | null>(null)
  const panelElement = shallowRef<HTMLElement | null>(null)
  const actions = new Map<string, () => void | Promise<void>>()
  let inputOptions: InputOptions | null = null
  let confirmOptions: ConfirmOptions | null = null
  let pendingSeparator = false
  let nextId = 0
  let generation = 0

  const content = () => state.value?.content ?? null

  /** 只更新内容，默认沿用当前语义角色与标签。 */
  function write(next: ScriptMenuContent, role?: 'menu' | 'dialog', label?: string): void {
    const current = state.value
    if (!current) return
    state.value = {
      ...current,
      role: role ?? current.role,
      label: label ?? current.label,
      content: next,
    }
  }

  /** 状态和错误留在菜单中，禁止异步失败静默丢失。 */
  function showMessage(text: string): void {
    write({ kind: 'message', text }, 'dialog')
  }

  function open(x: number, y: number, options: ScriptMenuOpenOptions = {}): void {
    generation++
    actions.clear()
    inputOptions = null
    confirmOptions = null
    pendingSeparator = false
    state.value = {
      x,
      y,
      role: options.role ?? 'menu',
      label: options.label ?? '脚本菜单',
      content: { kind: 'menu', items: [] },
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    }
  }

  /** 清空状态并让异步结果过期；`restoreFocus` 决定是否归还打开前的焦点。 */
  function closeInternal(restoreFocus: boolean): void {
    generation++
    const target = state.value?.returnFocus ?? null
    actions.clear()
    inputOptions = null
    confirmOptions = null
    state.value = null
    panelElement.value = null
    if (restoreFocus && target?.isConnected) target.focus()
  }

  function button(
    label: string,
    action: () => void | Promise<void>,
    item: ScriptMenuItem = {},
  ): void {
    const current = content()
    const items = current?.kind === 'menu' ? [...current.items] : []
    const id = `item-${++nextId}`
    actions.set(id, action)
    items.push({
      id,
      label,
      shortcut: item.shortcut ? formatShortcut(item.shortcut) : undefined,
      disabled: item.disabled === true,
      reason: item.reason,
      separatorBefore: pendingSeparator,
    })
    pendingSeparator = false
    write({ kind: 'menu', items })
  }

  function separator(): void {
    pendingSeparator = true
  }

  /** 执行菜单项；失败原因留在菜单里，版本已变化则忽略。 */
  async function run(id: string): Promise<void> {
    const action = actions.get(id)
    if (!action) return
    const current = generation
    try {
      await action()
    } catch (error) {
      if (current === generation) showMessage(errorText(error))
    }
  }

  /** 提交命名输入：空值、校验失败与异步失败都保留输入并展示原因。 */
  async function submitInput(raw: string): Promise<void> {
    const options = inputOptions
    const current = content()
    if (!options || current?.kind !== 'input' || current.running) return
    const value = raw.trim()
    const error = value ? (options.validate?.(value) ?? null) : '名称不能为空'
    if (error) return write({ ...current, error })
    const opened = generation
    write({ ...current, error: null, running: true })
    try {
      await options.submit(value)
      if (opened === generation) closeInternal(true)
    } catch (failure) {
      if (opened === generation) write({ ...current, error: errorText(failure), running: false })
    }
  }

  /** 执行二次确认；失败原因留在菜单中，允许重试。 */
  async function confirmAction(): Promise<void> {
    const options = confirmOptions
    const current = content()
    if (!options || current?.kind !== 'confirm' || current.running) return
    const opened = generation
    write({ ...current, error: null, running: true })
    try {
      await options.onConfirm()
      if (opened === generation) closeInternal(true)
    } catch (failure) {
      if (opened === generation) write({ ...current, error: errorText(failure), running: false })
    }
  }

  return {
    state,
    get generation() {
      return generation
    },
    get isOpen() {
      return state.value !== null
    },
    get mode() {
      return state.value?.role ?? null
    },
    panelElement,
    open,
    close() {
      closeInternal(true)
    },
    handleUiClose() {
      closeInternal(false)
    },
    clear() {
      actions.clear()
      pendingSeparator = false
      write({ kind: 'menu', items: [] })
    },
    message: showMessage,
    button,
    separator,
    input(options) {
      inputOptions = options
      write(
        { kind: 'input', label: options.label, value: options.value, error: null, running: false },
        'dialog',
        options.label,
      )
    },
    confirm(options) {
      confirmOptions = options
      write(
        {
          kind: 'confirm',
          text: options.text,
          confirmLabel: options.confirmLabel,
          error: null,
          running: false,
        },
        'dialog',
        options.confirmLabel,
      )
    },
    preview(preview) {
      write({ kind: 'preview', preview }, 'dialog', '声明预览')
    },
    run,
    submitInput,
    confirmAction,
    destroy() {
      generation++
      actions.clear()
      state.value = null
      panelElement.value = null
    },
  }
}
