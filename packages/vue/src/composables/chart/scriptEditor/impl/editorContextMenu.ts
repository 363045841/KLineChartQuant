/** 编辑器右键菜单：语义跳转、原子重命名和剪贴板操作，与语言 Worker 按需接通。 */
import { javascript } from '@codemirror/lang-javascript'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { errorText } from './errorText.js'
import { isMacPlatform, type ScriptMenuModel } from './scriptMenuModel.js'

type LanguageSupport = ReturnType<
  typeof import('@363045841yyt/klinechart-script-server').createScriptLanguageSupport
>
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
  definition: 'F12',
  declaration: 'Mod+Shift+F12',
  typeDefinition: 'Mod+Alt+F12',
  implementation: 'Mod+F12',
  rename: 'F2',
  copy: 'Mod+C',
  paste: 'Mod+V',
  cut: 'Mod+X',
  format: 'Shift+Alt+F',
}

/** F12 修饰键位：1 = Mod，2 = Shift，4 = Alt；未列出的组合不导航。 */
const F12_NAVIGATION: Readonly<Record<number, NavigationKind>> = {
  0: 'definition',
  1: 'implementation',
  3: 'declaration',
  5: 'typeDefinition',
}

/** 菜单状态由 Vue 侧渲染成 DropMenu；这里只负责产生内容与响应快捷键。 */
export function scriptEditorContextMenu(
  menu: ScriptMenuModel,
  support: () => LanguageSupport | undefined,
  editable: () => boolean,
  formatAvailable: () => boolean,
  format: () => Promise<void>,
) {
  return [
    ViewPlugin.define((view) => {
      const document = view.dom.ownerDocument

      /** 同文件直接选中目标；外部声明交给菜单里的只读预览。 */
      function reveal(target: Target): void {
        if (target.current) {
          menu.close()
          view.dispatch({
            selection: { anchor: target.from, head: target.to },
            effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
          })
          view.focus()
          return
        }
        menu.preview({
          path: target.path,
          source: target.source,
          from: target.from,
          to: target.to,
        })
      }

      /** 请求发出后的文档、会话或菜单发生变化，旧结果即失效。 */
      async function navigate(kind: NavigationKind): Promise<void> {
        const language = support()
        if (!language) return
        const original = view.state.doc
        const current = menu.generation
        const targets = await language.getNavigation(
          original.toString(),
          view.state.selection.main.head,
          kind,
        )
        if (current !== menu.generation || view.state.doc !== original || support() !== language)
          return
        if (!targets.length) {
          menu.message('未找到目标')
          return
        }
        if (targets.length === 1) {
          reveal(targets[0])
          return
        }
        menu.clear()
        for (const target of targets) {
          const line = target.source.slice(0, target.from).split('\n').length
          menu.button(`${target.path}:${line}`, () => reveal(target))
        }
      }

      /** 输入新名称后，一次提交所有引用修改，允许整体撤销。 */
      function rename(): void {
        const language = support()
        if (!language || !editable()) return
        const original = view.state.doc
        const position = view.state.selection.main.head
        const current = menu.generation
        const word = view.state.wordAt(position)
        menu.input({
          label: '重命名',
          value: word ? original.sliceString(word.from, word.to) : '',
          submit: async (name) => {
            const edits = await language.renameSymbol(original.toString(), position, name)
            if (current !== menu.generation || support() !== language) return
            if (view.state.doc !== original || !editable())
              throw new Error('文档已变化，请重新发起重命名')
            view.dispatch({
              changes: edits.map(({ span, newText }) => ({
                from: span.start,
                to: span.start + span.length,
                insert: newText,
              })),
              annotations: Transaction.userEvent.of('input.rename'),
            })
          },
        })
      }

      /** 剪贴板读写使用编辑器所属窗口，异步完成前保留原始选区与文档。 */
      async function clipboard(action: ClipboardAction): Promise<void> {
        const api = document.defaultView?.navigator.clipboard
        if (!api) throw new Error('当前环境无法访问剪贴板')
        const original = view.state.doc
        const selection = view.state.selection
        const current = menu.generation
        let text = ''
        if (action === 'paste') text = await api.readText()
        else
          await api.writeText(
            selection.ranges.map(({ from, to }) => original.sliceString(from, to)).join('\n'),
          )
        if (current !== menu.generation) return
        if (action !== 'copy') {
          if (view.state.doc !== original || !view.state.selection.eq(selection) || !editable()) {
            menu.message('文档或选区已变化，请重试')
            return
          }
          view.dispatch({
            ...view.state.replaceSelection(text),
            annotations: Transaction.userEvent.of(action === 'cut' ? 'delete.cut' : 'input.paste'),
            scrollIntoView: true,
          })
        }
        menu.close()
      }

      /** 右键命中已有选区时保留选区，其他位置将光标移动到点击处。 */
      function open(event: MouseEvent | KeyboardEvent): void {
        event.preventDefault()
        event.stopPropagation()
        let x: number
        let y: number
        if (event instanceof MouseEvent) {
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (
            position !== null &&
            !view.state.selection.ranges.some(({ from, to }) => from <= position && position <= to)
          ) {
            view.dispatch({ selection: { anchor: position } })
          }
          x = event.clientX
          y = event.clientY
        } else {
          const rect =
            view.coordsAtPos(view.state.selection.main.head) ?? view.dom.getBoundingClientRect()
          x = rect.left
          y = rect.bottom
        }
        menu.open(x, y, { role: 'menu', label: '脚本编辑器菜单' })
        for (const [kind, label] of NAVIGATION)
          menu.button(label, () => navigate(kind), {
            disabled: !support(),
            shortcut: SHORTCUTS[kind],
          })
        const renameBlocked = !support()
          ? '语言服务正在加载'
          : !editable()
            ? '内置脚本只读，创建副本后可重命名'
            : ''
        menu.button('重命名', rename, {
          disabled: Boolean(renameBlocked),
          reason: renameBlocked,
          shortcut: SHORTCUTS.rename,
        })
        const formatBlocked = !editable()
          ? '内置脚本只读，创建副本后可格式化'
          : !formatAvailable()
            ? '语言服务正在加载'
            : ''
        // 格式化只影响当前文档，完成后关闭菜单并把焦点交回编辑器。
        menu.button(
          '格式化文档',
          async () => {
            await format()
            menu.close()
          },
          { disabled: Boolean(formatBlocked), reason: formatBlocked, shortcut: SHORTCUTS.format },
        )
        menu.separator()
        const empty = view.state.selection.ranges.every((range) => range.empty)
        menu.button('复制', () => clipboard('copy'), { disabled: empty, shortcut: SHORTCUTS.copy })
        menu.button('粘贴', () => clipboard('paste'), {
          disabled: !editable(),
          reason: editable() ? '' : '内置脚本只读',
          shortcut: SHORTCUTS.paste,
        })
        menu.button('剪切', () => clipboard('cut'), {
          disabled: empty || !editable(),
          reason: !editable() ? '内置脚本只读' : empty ? '请先选择内容' : '',
          shortcut: SHORTCUTS.cut,
        })
      }

      /** 菜单打开时接管 Mod+C/V/X，避免编辑器先处理剪贴板。 */
      function handleClipboardShortcut(
        event: KeyboardEvent,
        mod: boolean,
        otherMod: boolean,
      ): boolean {
        if (
          !menu.isOpen ||
          menu.mode !== 'menu' ||
          !mod ||
          otherMod ||
          event.shiftKey ||
          event.altKey
        )
          return false
        const key = event.key.toLowerCase()
        const action: ClipboardAction | null =
          key === 'c' ? 'copy' : key === 'v' ? 'paste' : key === 'x' ? 'cut' : null
        if (!action) return false
        event.preventDefault()
        event.stopPropagation()
        const empty = view.state.selection.ranges.every((range) => range.empty)
        if ((action !== 'copy' && !editable()) || (action !== 'paste' && empty)) return true
        const current = menu.generation
        void clipboard(action).catch((error: unknown) => {
          if (current === menu.generation) menu.message(errorText(error))
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
      function handleLanguageShortcut(
        event: KeyboardEvent,
        mod: boolean,
        otherMod: boolean,
      ): boolean {
        const target = event.target instanceof Node ? event.target : null
        if ((target && menu.panelElement.value?.contains(target)) || otherMod) return false
        const kind = navigationKind(event, mod)
        if (kind && support()) {
          open(event)
          void navigate(kind).catch((error: unknown) => menu.message(errorText(error)))
          return true
        }
        if (
          event.key === 'F2' &&
          !mod &&
          !event.altKey &&
          !event.shiftKey &&
          support() &&
          editable()
        ) {
          open(event)
          rename()
          return true
        }
        return false
      }

      /** 菜单未打开时接管格式化快捷键；语言服务不可用时也阻止浏览器默认行为。 */
      function handleFormatShortcut(
        event: KeyboardEvent,
        mod: boolean,
        otherMod: boolean,
      ): boolean {
        if (!event.shiftKey || !event.altKey || mod || otherMod || event.key.toLowerCase() !== 'f')
          return false
        if (formatAvailable()) {
          event.preventDefault()
          event.stopPropagation()
          void format().catch((error: unknown) => menu.message(errorText(error)))
        }
        return true
      }

      /** 菜单自己的键盘导航由菜单处理，这里只接住菜单外的快捷键。 */
      function keydown(event: KeyboardEvent): void {
        const mac = isMacPlatform(document)
        const mod = mac ? event.metaKey : event.ctrlKey
        const otherMod = mac ? event.ctrlKey : event.metaKey
        if (handleClipboardShortcut(event, mod, otherMod)) return
        if (handleLanguageShortcut(event, mod, otherMod)) return
        if (menu.isOpen) return
        if (handleFormatShortcut(event, mod, otherMod)) return
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event)
      }

      view.dom.addEventListener('contextmenu', open)
      view.dom.addEventListener('keydown', keydown, true)
      return {
        /** 编辑器销毁时解除监听，菜单由 Vue 组件自行销毁。 */
        destroy() {
          view.dom.removeEventListener('contextmenu', open)
          view.dom.removeEventListener('keydown', keydown, true)
          menu.handleUiClose()
        },
      }
    }),
  ]
}
