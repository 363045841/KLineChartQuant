/**
 * 脚本编辑器基础扩展：按 CodeMirror 官方建议复制 basicSetup 的清单，
 * 仅把折叠栏标记换成 chevron 图标（basicSetup 自身不支持自定义）。
 */
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
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
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

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
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
]
