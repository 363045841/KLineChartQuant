/**
 * 脚本编辑器基础扩展：按 CodeMirror 官方建议复制 basicSetup 的清单，
 * 折叠栏使用 chevron，属性补全使用现有 Tabler 图标。
 */
import {
  autocompletion,
  type Completion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  type EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { h, render } from 'vue'
import IconTool from '~icons/tabler/tool'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/** 属性使用 Tabler 图标，其他类型保留默认符号；克隆后立即卸载 Vue 实例。 */
function createCompletionIcon(completion: Completion, view: EditorView): Node | null {
  const types = completion.type?.split(/\s+/)
  const property = types?.includes('property')
  if (!property) return null
  const host = view.dom.ownerDocument.createElement('span')
  host.className = 'cm-completionIcon cm-script-property-icon'
  host.setAttribute('aria-hidden', 'true')
  render(h(IconTool, { width: '1em', height: '1em' }), host)
  const icon = host.cloneNode(true)
  render(null, host)
  return icon
}

/** 折叠栏标记路径：展开显示 chevron-down，折叠显示 chevron-right。 */
const FOLD_ARROW_PATH = {
  open: 'M6 9l6 6l6 -6',
  closed: 'M9 6l6 6l-6 6',
} as const

/** 折叠栏标记：返回包裹 chevron 图标的元素，替代默认的 “⌄/›” 字符。 */
function createFoldMarker(open: boolean): HTMLElement {
  const marker = document.createElement('span')
  marker.className = 'cm-fold-arrow'

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')

  const path = document.createElementNS(SVG_NAMESPACE, 'path')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('d', open ? FOLD_ARROW_PATH.open : FOLD_ARROW_PATH.closed)

  svg.appendChild(path)
  marker.appendChild(svg)
  return marker
}

/** 编辑器基础扩展，等价于 basicSetup 并替换折叠栏标记。 */
export const scriptEditorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter({ markerDOM: createFoldMarker }),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion({
    addToOptions: [
      {
        position: 20,
        render: (completion, _state, view) => createCompletionIcon(completion, view),
      },
    ],
  }),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    // Tab 使用编辑器的空格缩进，Shift+Tab 减少缩进，阻止浏览器切换焦点。
    indentWithTab,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
]
