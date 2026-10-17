/** 统一创建只读代码提示，封装语法配色、文本更新、范围强调和资源释放。 */
import { typescriptLanguage } from '@codemirror/lang-javascript'
import { Compartment, EditorState } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { ScriptCodeView, ScriptTextRange } from '../types.js'
import { scriptSyntaxHighlighting } from './codePresentation.js'

/** 提示自身持有布局样式，新增提示类型无需在主编辑器中追加选择器。 */
const codeViewTheme = EditorView.theme({
  '&.cm-script-code': {
    height: 'auto',
    backgroundColor: 'transparent',
    fontSize: 'inherit',
  },
  '&.cm-script-code .cm-content': { padding: '0', caretColor: 'transparent' },
  '&.cm-script-code .cm-line': { padding: '0' },
  '&.cm-script-code .cm-scroller': {
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'visible',
    lineHeight: 'inherit',
  },
  '.cm-script-code-emphasis': { fontWeight: '700' },
})

/** 将代码挂入指定节点，返回稳定的更新与销毁接口。 */
export function createScriptCodeView(parent: HTMLElement, source: string): ScriptCodeView {
  const emphasis = new Compartment()
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        typescriptLanguage,
        // 长示例在提示宽度内换行，避免横向溢出被裁切。
        EditorView.lineWrapping,
        scriptSyntaxHighlighting,
        codeViewTheme,
        EditorView.editorAttributes.of({ class: 'cm-script-code' }),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        emphasis.of([]),
      ],
    }),
  })
  let previousText = source
  let previousRange: ScriptTextRange | null = null
  return {
    dom: view.dom,
    /** 一次事务同时更新文本和强调范围，保留视图与 One Dark 语法颜色。 */
    update(text, range = null) {
      if (
        text === previousText &&
        range?.from === previousRange?.from &&
        range?.to === previousRange?.to
      )
        return
      const marks =
        range && range.from < range.to
          ? Decoration.set([
              Decoration.mark({ class: 'cm-script-code-emphasis' }).range(range.from, range.to),
            ])
          : Decoration.none
      view.dispatch({
        changes:
          text === previousText ? undefined : { from: 0, to: view.state.doc.length, insert: text },
        effects: emphasis.reconfigure(EditorView.decorations.of(marks)),
      })
      previousText = text
      previousRange = range
    },
    /** 由所属提示统一释放 CodeMirror 的监听与观察器。 */
    destroy() {
      view.destroy()
    },
  }
}
