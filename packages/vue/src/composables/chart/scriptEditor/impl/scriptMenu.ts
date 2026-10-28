/**
 * 脚本右键菜单：编辑器与文件目录共用的顶层 popover。
 *
 * 菜单只负责渲染与交互，具体操作由调用方以按钮/输入回调提供；异步失败统一展示在菜单内。
 */
import './scriptMenu.css'

/** 菜单可见性变化时回调，供调用方释放预览或恢复焦点。 */
type CloseHandler = () => void

/** 菜单创建选项。 */
export interface ScriptMenuOptions {
  /**
   * 菜单挂载点。
   *
   * 必须位于当前模态弹窗或独立窗口内部：浏览器会让模态 dialog 之外的内容进入 inert 状态，
   * 挂到 body 的浮层将无法响应悬浮与点击。
   */
  readonly host?: HTMLElement
  readonly onClose?: CloseHandler
}

/** 单个菜单项的可选展示与禁用原因。 */
export interface ScriptMenuItem {
  readonly shortcut?: string
  readonly disabled?: boolean
  /** 禁用时展示给用户的具体原因。 */
  readonly reason?: string
}

/** 共用菜单的公开操作。 */
export interface ScriptMenu {
  readonly element: HTMLDivElement
  readonly isOpen: boolean
  /** 单调递增的菜单版本；异步操作据此判断结果是否过期。 */
  readonly generation: number
  open(x: number, y: number, role?: 'menu' | 'dialog'): void
  close(): void
  clear(): void
  message(text: string): void
  button(
    label: string,
    action: () => void | Promise<void>,
    item?: ScriptMenuItem,
  ): HTMLButtonElement
  separator(): void
  /** 仅保留输入框本身，用于命名与重命名。 */
  input(options: {
    label: string
    value: string
    submit: (value: string) => void | Promise<void>
    /** 返回错误文本时保留输入并展示，不提交。 */
    validate?: (value: string) => string | null
  }): void
  /** 菜单内二次确认，用于删除等不可逆操作。 */
  confirm(options: {
    text: string
    confirmLabel: string
    onConfirm: () => void | Promise<void>
  }): void
  /** 菜单内的 Escape、Tab 与方向键导航；返回是否已处理。 */
  handleKeydown(event: KeyboardEvent): boolean
  /** 重新把当前尺寸的菜单限制在窗口内。 */
  fit(): void
  destroy(): void
}

/** 判断快捷键展示与 Mod 含义是否使用 Mac 平台。 */
export function isMacPlatform(ownerDocument: Document): boolean {
  return /Mac|iPhone|iPad/.test(ownerDocument.defaultView?.navigator.platform ?? '')
}

/**
 * 创建一个菜单实例。
 *
 * @param ownerDocument 菜单所属文档，用于创建元素和监听外部点击
 * @param options 挂载点必须位于模态弹窗内部；onClose 用于释放调用方资源
 */
export function createScriptMenu(
  ownerDocument: Document,
  options: ScriptMenuOptions = {},
): ScriptMenu {
  const panel = ownerDocument.createElement('div')
  panel.className = 'klc-script-menu'
  panel.popover = 'manual'
  panel.setAttribute('aria-label', '脚本菜单')
  ;(options.host ?? ownerDocument.body).append(panel)
  let generation = 0
  let opened = false

  /** 关闭菜单并让进行中的异步操作过期。 */
  function close(): void {
    generation++
    if (opened && typeof panel.hidePopover === 'function') panel.hidePopover()
    opened = false
    panel.replaceChildren()
    panel.classList.remove('klc-script-menu--bare')
    panel.removeAttribute('role')
    options.onClose?.()
  }

  /** 将菜单限定在当前窗口内，右侧与底部自动向内偏移。 */
  function fit(): void {
    const rect = panel.getBoundingClientRect()
    panel.style.left = `${Math.max(0, Math.min(rect.left, ownerDocument.documentElement.clientWidth - rect.width))}px`
    panel.style.top = `${Math.max(0, Math.min(rect.top, ownerDocument.documentElement.clientHeight - rect.height))}px`
  }

  /** 状态和错误留在菜单中，禁止异步失败静默丢失。 */
  function showMessage(text: string): void {
    panel.classList.remove('klc-script-menu--bare')
    panel.replaceChildren()
    const status = ownerDocument.createElement('div')
    status.className = 'klc-script-menu-status'
    status.setAttribute('role', 'status')
    status.textContent = text
    panel.append(status)
    fit()
  }

  /** 点击菜单外关闭；菜单自身的事件不冒泡到关闭逻辑。 */
  function outside(event: Event): void {
    if (!opened || event.composedPath().includes(panel)) return
    close()
  }

  ownerDocument.addEventListener('pointerdown', outside, true)

  return {
    element: panel,
    get isOpen() {
      return opened
    },
    get generation() {
      return generation
    },
    open(x, y, role = 'menu') {
      close()
      panel.setAttribute('role', role)
      panel.style.left = `${x}px`
      panel.style.top = `${y}px`
      if (typeof panel.showPopover === 'function') panel.showPopover()
      opened = true
      fit()
    },
    close,
    clear() {
      panel.replaceChildren()
      panel.classList.remove('klc-script-menu--bare')
    },
    message: showMessage,
    button(label, action, item = {}) {
      const element = ownerDocument.createElement('button')
      element.type = 'button'
      element.textContent = label
      if (item.shortcut) {
        const hint = ownerDocument.createElement('span')
        hint.className = 'klc-script-menu-shortcut'
        hint.textContent = item.shortcut.replace('Mod', isMacPlatform(ownerDocument) ? '⌘' : 'Ctrl')
        element.append(hint)
      }
      element.disabled = item.disabled === true
      // 禁用项说明具体原因，避免用户把只读身份误判成功能故障。
      if (element.disabled && item.reason) element.title = item.reason
      element.setAttribute('role', 'menuitem')
      element.addEventListener('click', () => {
        const current = generation
        Promise.resolve()
          .then(action)
          .catch((error: unknown) => {
            if (generation === current)
              showMessage(error instanceof Error ? error.message : String(error))
          })
      })
      panel.append(element)
      return element
    },
    separator() {
      const separator = ownerDocument.createElement('div')
      separator.setAttribute('role', 'separator')
      panel.append(separator)
    },
    input({ label, value, submit, validate }) {
      panel.replaceChildren()
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', label)
      panel.classList.add('klc-script-menu--bare')
      const input = ownerDocument.createElement('input')
      input.className = 'klc-script-input'
      input.setAttribute('aria-label', label)
      input.autocomplete = 'off'
      input.spellcheck = false
      input.value = value
      panel.append(input)
      const status = ownerDocument.createElement('div')
      status.className = 'klc-script-menu-status'
      status.setAttribute('role', 'status')
      let running = false
      // Enter 直接提交当前名称；输入法组合中的确认键不算提交。
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing) return
        event.preventDefault()
        const next = input.value.trim()
        if (running) return
        const error = next ? (validate?.(next) ?? null) : '名称不能为空'
        if (error) {
          status.textContent = error
          panel.append(status)
          fit()
          return
        }
        running = true
        input.disabled = true
        const current = generation
        Promise.resolve()
          .then(() => submit(next))
          .then(() => {
            if (current === generation) close()
          })
          .catch((failure: unknown) => {
            if (current !== generation) return
            status.textContent = failure instanceof Error ? failure.message : String(failure)
            panel.append(status)
            input.disabled = false
            running = false
            fit()
            input.focus()
            input.select()
          })
      })
      fit()
      input.focus()
      input.select()
    },
    /** 破坏性操作先确认，避免误点直接删除目录内容。 */
    confirm({ text, confirmLabel, onConfirm }) {
      panel.replaceChildren()
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', confirmLabel)
      const status = ownerDocument.createElement('div')
      status.className = 'klc-script-menu-status'
      status.textContent = text
      panel.append(status)
      const cancel = ownerDocument.createElement('button')
      cancel.type = 'button'
      cancel.textContent = '取消'
      cancel.addEventListener('click', () => close())
      const submit = ownerDocument.createElement('button')
      submit.type = 'button'
      submit.textContent = confirmLabel
      submit.addEventListener('click', () => {
        const current = generation
        submit.disabled = true
        Promise.resolve()
          .then(onConfirm)
          .then(() => {
            if (current === generation) close()
          })
          .catch((failure: unknown) => {
            if (current === generation)
              showMessage(failure instanceof Error ? failure.message : String(failure))
          })
      })
      panel.append(cancel, submit)
      fit()
      submit.focus()
    },
    handleKeydown(event) {
      if (!opened) return false
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return true
      }
      if (event.key === 'Tab') {
        close()
        return true
      }
      if (
        panel.getAttribute('role') !== 'menu' ||
        !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      )
        return false
      event.preventDefault()
      event.stopPropagation()
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.findIndex((element) => element === ownerDocument.activeElement)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
      return true
    },
    fit,
    destroy() {
      close()
      ownerDocument.removeEventListener('pointerdown', outside, true)
      panel.remove()
    },
  }
}
