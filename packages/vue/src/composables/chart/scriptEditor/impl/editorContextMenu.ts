/** 编辑器右键菜单：语义跳转、原子重命名和剪贴板操作，与语言 Worker 按需接通。 */
import { javascript } from '@codemirror/lang-javascript'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { scriptEditorHighlight, scriptEditorTheme } from './editorTheme.js'

type LanguageSupport = ReturnType<typeof import('@363045841yyt/klinechart-script-server').createScriptLanguageSupport>
type NavigationKind = Parameters<LanguageSupport['getNavigation']>[2]
type Target = Awaited<ReturnType<LanguageSupport['getNavigation']>>[number]

const NAVIGATION: ReadonlyArray<readonly [NavigationKind, string]> = [
  ['definition', '转到定义'],
  ['declaration', '转到声明'],
  ['typeDefinition', '转到类型定义'],
  ['implementation', '转到实现'],
]

type ClipboardAction = 'copy' | 'paste' | 'cut'

const SHORTCUTS = {
  definition: 'F12', declaration: 'Mod+Shift+F12', typeDefinition: 'Mod+Alt+F12',
  implementation: 'Mod+F12', rename: 'F2', copy: 'Mod+C', paste: 'Mod+V', cut: 'Mod+X',
  format: 'Shift+Alt+F',
}

/** F12 修饰键位：1 = Mod，2 = Shift，4 = Alt；未列出的组合不导航。 */
const F12_NAVIGATION: Readonly<Record<number, NavigationKind>> = {
  0: 'definition',
  1: 'implementation',
  3: 'declaration',
  5: 'typeDefinition',
}

/** 菜单使用 Popover 顶层，避免编辑器滚动容器和弹窗裁切。 */
export function scriptEditorContextMenu(
  support: () => LanguageSupport | undefined,
  editable: () => boolean,
  theme: () => 'light' | 'dark',
  formatAvailable: () => boolean,
  format: () => Promise<void>,
) {
  return [contextMenuTheme, ViewPlugin.define((view) => {
    const document = view.dom.ownerDocument
    const panel = document.createElement('div')
    panel.className = 'cm-script-context-menu'
    panel.popover = 'manual'
    panel.setAttribute('aria-label', '脚本编辑器菜单')
    view.dom.append(panel)
    let generation = 0
    let preview: EditorView | undefined

    /** 关闭时使异步操作过期，同时释放只读预览。 */
    function close(restoreFocus = false): void {
      generation++
      preview?.destroy()
      preview = undefined
      if (panel.matches(':popover-open')) panel.hidePopover()
      panel.replaceChildren()
      panel.classList.remove('cm-script-context-menu--bare')
      if (restoreFocus) view.focus()
    }

    /** 状态和错误留在菜单中，禁止异步失败静默丢失。 */
    function message(text: string): void {
      panel.classList.remove('cm-script-context-menu--bare')
      panel.replaceChildren()
      const status = document.createElement('div')
      status.className = 'cm-script-menu-status'
      status.setAttribute('role', 'status')
      status.textContent = text
      panel.append(status)
      fit()
    }

    /** 判断快捷键展示与 Mod 含义是否使用 Mac 平台。 */
    function isMac(): boolean {
      return /Mac|iPhone|iPad/.test(document.defaultView?.navigator.platform ?? '')
    }

    /** 创建整行菜单按钮，操作失败时给出可见提示。 */
    function button(label: string, action: () => void | Promise<void>, disabled = false, shortcut = '', disabledReason = ''): HTMLButtonElement {
      const element = document.createElement('button')
      element.type = 'button'
      element.textContent = label
      if (shortcut) {
        const hint = document.createElement('span')
        hint.className = 'cm-script-menu-shortcut'
        hint.textContent = shortcut.replace('Mod', isMac() ? '⌘' : 'Ctrl')
        element.append(hint)
      }
      element.disabled = disabled
      // 禁用项说明具体原因，避免用户把只读身份误判成功能故障。
      if (disabled && disabledReason) element.title = disabledReason
      element.setAttribute('role', 'menuitem')
      element.addEventListener('click', () => {
        const current = generation
        Promise.resolve().then(action).catch((error: unknown) => {
          if (generation === current) message(error instanceof Error ? error.message : String(error))
        })
      })
      panel.append(element)
      return element
    }

    /** 同文件直接选中目标；外部声明在可关闭的只读代码视图中展示。 */
    function reveal(target: Target): void {
      if (target.current) {
        close()
        view.dispatch({ selection: { anchor: target.from, head: target.to }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
        view.focus()
        return
      }
      panel.replaceChildren()
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', '声明预览')
      panel.classList.remove('cm-script-context-menu--bare')
      const header = document.createElement('div')
      header.className = 'cm-script-preview-header'
      const title = document.createElement('div')
      title.className = 'cm-script-preview-path'
      title.textContent = target.path
      title.title = target.path
      const dismiss = document.createElement('button')
      dismiss.type = 'button'
      dismiss.className = 'cm-script-preview-close'
      dismiss.setAttribute('aria-label', '关闭声明预览')
      dismiss.title = '关闭声明预览 (Esc)'
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      icon.setAttribute('viewBox', '0 0 24 24')
      icon.setAttribute('fill', 'none')
      icon.setAttribute('stroke', 'currentColor')
      icon.setAttribute('stroke-width', '1.5')
      icon.setAttribute('stroke-linecap', 'round')
      icon.setAttribute('aria-hidden', 'true')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', 'M6 6l12 12M6 18L18 6')
      icon.append(path)
      dismiss.append(icon)
      dismiss.addEventListener('click', () => close(true))
      header.append(title, dismiss)
      panel.append(header)
      const host = document.createElement('div')
      host.className = 'cm-script-definition-preview'
      panel.append(host)
      preview = new EditorView({ parent: host, state: EditorState.create({
        doc: target.source,
        selection: { anchor: target.from, head: target.to },
        extensions: [javascript({ typescript: true }), scriptEditorTheme, scriptEditorHighlight(theme()), EditorState.readOnly.of(true), EditorView.editable.of(false)],
      }) })
      preview.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'center' }) })
      fit()
      dismiss.focus()
    }

    /** 将菜单限定在当前窗口内，右下角自动向内偏移。 */
    function fit(): void {
      const rect = panel.getBoundingClientRect()
      panel.style.left = `${Math.max(0, Math.min(rect.left, document.documentElement.clientWidth - rect.width))}px`
      panel.style.top = `${Math.max(0, Math.min(rect.top, document.documentElement.clientHeight - rect.height))}px`
    }

    /** 请求发出后的文档、会话或菜单发生变化，旧结果即失效。 */
    async function navigate(kind: NavigationKind): Promise<void> {
      const language = support()
      if (!language) return
      const original = view.state.doc
      const current = generation
      const targets = await language.getNavigation(original.toString(), view.state.selection.main.head, kind)
      if (current !== generation || view.state.doc !== original || support() !== language) return
      if (!targets.length) { message('未找到目标'); return }
      if (targets.length === 1) { reveal(targets[0]); return }
      panel.replaceChildren()
      for (const target of targets) {
        const line = target.source.slice(0, target.from).split('\n').length
        button(`${target.path}:${line}`, () => reveal(target))
      }
      fit()
      panel.querySelector('button')?.focus()
    }

    /** 输入新名称后，一次提交所有引用修改，允许整体撤销。 */
    function rename(): void {
      const language = support()
      if (!language || !editable()) return
      const original = view.state.doc
      const position = view.state.selection.main.head
      const current = generation
      const word = view.state.wordAt(position)
      panel.replaceChildren()
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-label', '重命名')
      panel.classList.add('cm-script-context-menu--bare')
      const input = document.createElement('input')
      input.className = 'cm-script-rename-input'
      input.setAttribute('aria-label', '新名称')
      input.autocomplete = 'off'
      input.spellcheck = false
      input.value = word ? original.sliceString(word.from, word.to) : ''
      panel.append(input)
      const status = document.createElement('div')
      status.className = 'cm-script-menu-status'
      status.setAttribute('role', 'status')
      let running = false
      // Enter 直接提交当前名称；输入法组合中的确认键不算提交。
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing) return
        event.preventDefault()
        const name = input.value.trim()
        if (running || !name) return
        running = true
        input.disabled = true
        void language.renameSymbol(original.toString(), position, name).then((edits) => {
          if (current !== generation || support() !== language) return
          if (view.state.doc !== original || !editable()) {
            status.textContent = '文档已变化，请重新发起重命名'
            panel.append(status)
            input.disabled = false
            running = false
            fit()
            return
          }
          view.dispatch({ changes: edits.map(({ span, newText }) => ({ from: span.start, to: span.start + span.length, insert: newText })), annotations: Transaction.userEvent.of('input.rename') })
          close(true)
        }).catch((error: unknown) => {
          if (current !== generation) return
          status.textContent = error instanceof Error ? error.message : String(error)
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
    }

    /** 剪贴板读写使用编辑器所属窗口，异步完成前保留原始选区与文档。 */
    async function clipboard(action: ClipboardAction): Promise<void> {
      const api = document.defaultView?.navigator.clipboard
      if (!api) throw new Error('当前环境无法访问剪贴板')
      const original = view.state.doc
      const selection = view.state.selection
      const current = generation
      let text = ''
      if (action === 'paste') text = await api.readText()
      else await api.writeText(selection.ranges.map(({ from, to }) => original.sliceString(from, to)).join('\n'))
      if (current !== generation) return
      if (action !== 'copy') {
        if (view.state.doc !== original || !view.state.selection.eq(selection) || !editable()) { message('文档或选区已变化，请重试'); return }
        view.dispatch({ ...view.state.replaceSelection(text), annotations: Transaction.userEvent.of(action === 'cut' ? 'delete.cut' : 'input.paste'), scrollIntoView: true })
      }
      close(true)
    }

    /** 右键命中已有选区时保留选区，其他位置将光标移动到点击处。 */
    function open(event: MouseEvent | KeyboardEvent): void {
      event.preventDefault()
      event.stopPropagation()
      close()
      let x: number
      let y: number
      if (event instanceof MouseEvent) {
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (position !== null && !view.state.selection.ranges.some(({ from, to }) => from <= position && position <= to)) {
          view.dispatch({ selection: { anchor: position } })
        }
        x = event.clientX
        y = event.clientY
      } else {
        const rect = view.coordsAtPos(view.state.selection.main.head) ?? view.dom.getBoundingClientRect()
        x = rect.left
        y = rect.bottom
      }
      panel.setAttribute('role', 'menu')
      panel.setAttribute('aria-label', '脚本编辑器菜单')
      for (const [kind, label] of NAVIGATION) button(label, () => navigate(kind), !support(), SHORTCUTS[kind])
      const renameBlocked = !support() ? '语言服务正在加载' : !editable() ? '内置脚本只读，创建副本后可重命名' : ''
      button('重命名', rename, Boolean(renameBlocked), SHORTCUTS.rename, renameBlocked)
      const formatBlocked = !editable() ? '内置脚本只读，创建副本后可格式化' : !formatAvailable() ? '语言服务正在加载' : ''
      // 格式化只影响当前文档，完成后关闭菜单并把焦点交回编辑器。
      button('格式化文档', async () => { await format(); close(true) }, Boolean(formatBlocked), SHORTCUTS.format, formatBlocked)
      const separator = document.createElement('div')
      separator.setAttribute('role', 'separator')
      panel.append(separator)
      const empty = view.state.selection.ranges.every((range) => range.empty)
      button('复制', () => clipboard('copy'), empty, SHORTCUTS.copy)
      button('粘贴', () => clipboard('paste'), !editable(), SHORTCUTS.paste, editable() ? '' : '内置脚本只读')
      button('剪切', () => clipboard('cut'), empty || !editable(), SHORTCUTS.cut, !editable() ? '内置脚本只读' : empty ? '请先选择内容' : '')
      panel.style.left = `${x}px`
      panel.style.top = `${y}px`
      panel.showPopover()
      fit()
      if (event instanceof KeyboardEvent) panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    }

    /** 菜单打开时接管 Mod+C/V/X，避免编辑器先处理剪贴板。 */
    function handleClipboardShortcut(event: KeyboardEvent, mod: boolean, otherMod: boolean): boolean {
      if (!panel.matches(':popover-open') || panel.getAttribute('role') !== 'menu' || !mod || otherMod || event.shiftKey || event.altKey) return false
      const key = event.key.toLowerCase()
      const action: ClipboardAction | null = key === 'c' ? 'copy' : key === 'v' ? 'paste' : key === 'x' ? 'cut' : null
      if (!action) return false
      event.preventDefault()
      event.stopPropagation()
      const empty = view.state.selection.ranges.every((range) => range.empty)
      if ((action !== 'copy' && !editable()) || (action !== 'paste' && empty)) return true
      const current = generation
      void clipboard(action).catch((error: unknown) => {
        if (current === generation) message(error instanceof Error ? error.message : String(error))
      })
      return true
    }

    /** 把 F12 组合解析成导航类型，其他按键返回 null。 */
    function navigationKind(event: KeyboardEvent, mod: boolean): NavigationKind | null {
      if (event.key !== 'F12') return null
      // 位掩码：1 = Mod，2 = Shift，4 = Alt；未列出的组合不映射。
      const modifiers = (mod ? 1 : 0) + (event.shiftKey ? 2 : 0) + (event.altKey ? 4 : 0)
      return F12_NAVIGATION[modifiers] ?? null
    }

    /** F12 系列与 F2 只在焦点不在菜单内时生效。 */
    function handleLanguageShortcut(event: KeyboardEvent, mod: boolean, otherMod: boolean): boolean {
      if (panel.contains(event.target instanceof Node ? event.target : null) || otherMod) return false
      const kind = navigationKind(event, mod)
      if (kind && support()) {
        open(event)
        void navigate(kind).catch((error: unknown) => message(error instanceof Error ? error.message : String(error)))
        return true
      }
      if (event.key === 'F2' && !mod && !event.altKey && !event.shiftKey && support() && editable()) {
        open(event)
        rename()
        return true
      }
      return false
    }

    /** 菜单未打开时接管格式化快捷键；语言服务不可用时也阻止浏览器默认行为。 */
    function handleFormatShortcut(event: KeyboardEvent, mod: boolean, otherMod: boolean): boolean {
      if (!event.shiftKey || !event.altKey || mod || otherMod || event.key.toLowerCase() !== 'f') return false
      if (formatAvailable()) {
        event.preventDefault()
        event.stopPropagation()
        void format().catch((error: unknown) => message(error instanceof Error ? error.message : String(error)))
      }
      return true
    }

    /** 已打开菜单内的 Escape、Tab 和方向键导航。 */
    function handleMenuNavigation(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close(true)
        return
      }
      if (event.key === 'Tab') {
        close(true)
        return
      }
      if (panel.getAttribute('role') !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.findIndex((element) => element === document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }

    /** 菜单键盘导航和关闭不交给编辑器或宿主弹窗。 */
    function keydown(event: KeyboardEvent): void {
      const mac = isMac()
      const mod = mac ? event.metaKey : event.ctrlKey
      const otherMod = mac ? event.ctrlKey : event.metaKey
      if (handleClipboardShortcut(event, mod, otherMod)) return
      if (handleLanguageShortcut(event, mod, otherMod)) return
      if (!panel.matches(':popover-open')) {
        if (handleFormatShortcut(event, mod, otherMod)) return
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event)
        return
      }
      handleMenuNavigation(event)
    }

    /** 点击面板外关闭，保持编辑器选区不因菜单按钮而丢失。 */
    function outside(event: Event): void {
      if (!event.composedPath().includes(panel)) close()
    }
    view.dom.addEventListener('contextmenu', open)
    view.dom.addEventListener('keydown', keydown, true)
    document.addEventListener('pointerdown', outside, true)
    return {
      /** 编辑器销毁时解除全局监听和所有临时视图。 */
      destroy() {
        close()
        view.dom.removeEventListener('contextmenu', open)
        view.dom.removeEventListener('keydown', keydown, true)
        document.removeEventListener('pointerdown', outside, true)
        panel.remove()
      },
    }
  })]
}

/** DropMenu 的圆角外框与整行悬停；外框无留白，文字保留左右间距。 */
const contextMenuTheme = EditorView.theme({
  '.cm-script-context-menu': {
    position: 'fixed', inset: 'auto', margin: '0', padding: '0', minWidth: '180px',
    maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', overflow: 'auto',
    border: '0', borderRadius: 'var(--klc-radius-xs, 4px)',
    background: 'var(--klc-color-ui-input)', color: 'var(--klc-color-ui-text)',
    boxShadow: 'var(--klc-elevation-2)', fontFamily: 'var(--klc-typography-font-family)',
    fontSize: 'var(--klc-text-12-font-size, 12px)',
  },
  '.cm-script-context-menu button': {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', boxSizing: 'border-box',
    width: '100%', minHeight: '28px', padding: '0 12px', margin: '0', border: '0', borderRadius: '0',
    background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  '.cm-script-context-menu button:hover:not(:disabled), .cm-script-context-menu button:focus-visible': { background: 'var(--klc-color-ui-hover)', outline: 'none' },
  '.cm-script-context-menu button:disabled': { opacity: '0.5', cursor: 'default' },
  '.cm-script-menu-shortcut': { color: 'var(--klc-color-ui-muted)', fontSize: '0.9em', whiteSpace: 'nowrap' },
  '.cm-script-context-menu [role=separator]': { borderTop: '1px solid var(--klc-color-ui-border)' },
  '.cm-script-menu-status': {
    padding: '8px 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: '20px',
  },
  '.cm-script-menu-status:empty': { display: 'none' },
  /* 重命名只有输入框本身：移除浮层背景与阴影，不再叠加任何包裹容器。 */
  '.cm-script-context-menu--bare': {
    background: 'transparent', boxShadow: 'none', borderRadius: '0', overflow: 'visible',
  },
  '.cm-script-rename-input': {
    boxSizing: 'border-box', display: 'block', width: 'min(220px, calc(100vw - 32px))',
    height: '28px', margin: '0', padding: '0 8px',
    border: '1px solid var(--klc-color-ui-border)', borderRadius: 'var(--klc-radius-xs, 4px)',
    background: 'var(--klc-color-ui-surface)', color: 'var(--klc-color-ui-text)',
    font: 'inherit', outline: 'none',
  },
  '.cm-script-context-menu--bare .cm-script-menu-status': {
    padding: '4px 2px 0', color: 'var(--klc-color-ui-danger-text)',
  },
  '.cm-script-preview-header': {
    display: 'flex', alignItems: 'center', gap: '8px', boxSizing: 'border-box',
    width: 'min(640px, 80vw)', minHeight: '36px', padding: '4px 8px 4px 12px',
    borderBottom: '1px solid var(--klc-color-ui-border)',
  },
  '.cm-script-preview-path': {
    flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: 'var(--klc-color-ui-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--klc-text-12-font-size, 12px)',
  },
  '.cm-script-context-menu .cm-script-preview-close': {
    flex: '0 0 auto', justifyContent: 'center', width: '26px', height: '26px', minHeight: '0',
    padding: '0', borderRadius: 'var(--klc-radius-xs, 4px)', color: 'var(--klc-color-ui-muted)',
  },
  '.cm-script-context-menu .cm-script-preview-close:hover, .cm-script-context-menu .cm-script-preview-close:focus-visible': {
    color: 'var(--klc-color-ui-text)', background: 'var(--klc-color-ui-hover)',
  },
  '.cm-script-preview-close svg': { width: '16px', height: '16px' },
  '.cm-script-definition-preview': { width: 'min(640px, 80vw)', height: 'min(360px, 50dvh)' },
})
