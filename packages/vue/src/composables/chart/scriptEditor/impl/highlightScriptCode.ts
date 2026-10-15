/** 悬浮提示的只读代码视图：复用编辑器的语言解析器和语法配色。 */
import { typescriptLanguage } from '@codemirror/lang-javascript'
import { syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'

/** 将代码挂入指定节点；由提示框销毁时统一释放视图。 */
export function highlightScriptCode(parent: HTMLElement, source: string): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        typescriptLanguage,
        syntaxHighlighting(oneDarkHighlightStyle),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    }),
  })
}
