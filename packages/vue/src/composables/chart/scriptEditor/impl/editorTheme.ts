/** CodeMirror 界面消费图表 Token；语法高亮按有效主题在 One Dark 与 Basic Light 间切换。 */
import { syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { basicLightHighlightStyle } from 'cm6-theme-basic-light'

/** 深色沿用 One Dark，浅色使用 Basic Light；框体颜色始终由 Token 变量控制。 */
export function scriptEditorHighlight(theme: 'light' | 'dark'): Extension {
  return syntaxHighlighting(theme === 'dark' ? oneDarkHighlightStyle : basicLightHighlightStyle)
}

/**
 * 脚本提示框框体的尺寸约束：参数提示与 hover 提示是两种 DOM 形态，声明只有这一份。
 * 宽度到上限即换行，长签名和长 JSDoc 都不会横向撑破编辑区。
 */
const tooltipBoxStyle = {
  backgroundColor: 'var(--klc-color-ui-surface)',
  fontSize: 'var(--klc-text-label-13-font-size, 13px)',
  lineHeight: '1.6',
  maxWidth: 'min(520px, 46vw)',
  maxHeight: 'min(60vh, 420px)',
  overflow: 'auto',
}

/** 编辑区、行号、选区和补全面板共用图表的界面颜色。 */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--klc-color-ui-background)',
    color: 'var(--klc-color-ui-text)',
    fontSize: 'var(--klc-text-label-13-font-size, 13px)',
    // 代码用 JetBrains Mono 的原始字重 400，避免浏览器合成。
    fontWeight: 'var(--klc-font-weight-mono, 400)',
    // 行高同时驱动正文行与折叠标记高度，避免两处各写一份。
    '--cm-line-height': '1.8',
    '--cm-selection-color': 'var(--klc-color-ui-selection)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    // 宿主可能用全局 `font-family … !important` 注入 UI 字体；编辑器必须钉住等宽字体。
    fontFamily: 'var(--klc-typography-font-family-mono) !important',
    lineHeight: 'var(--cm-line-height)',
    overflow: 'auto',
  },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--klc-color-ui-accent)' },
  '.cm-line': { padding: '0 20px 0 14px' },
  '.cm-gutters': {
    backgroundColor: 'var(--klc-color-ui-background)',
    color: 'var(--klc-color-ui-muted)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '40px', padding: '0 8px 0 12px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 6px', cursor: 'pointer' },
  // 标记撑满与行号一致的行高并居中图标，避免基线对齐造成上下偏移。
  '.cm-fold-arrow': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(var(--cm-line-height) * 1em)',
  },
  '.cm-fold-arrow svg': {
    display: 'block',
    width: '14px',
    height: '14px',
    color: 'var(--klc-color-ui-muted)',
  },
  '.cm-foldGutter .cm-gutterElement:hover svg': { color: 'var(--klc-color-ui-text)' },
  // CodeMirror 默认折叠占位符是固定浅灰，必须用主题变量覆盖，否则深色模式下会发白。
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--klc-color-ui-control-background)',
    border: '1px solid var(--klc-color-ui-border)',
    borderRadius: 'var(--klc-radius-xs, 4px)',
    color: 'var(--klc-color-ui-muted)',
    margin: '0 1px',
    padding: '0 1px',
    cursor: 'pointer',
  },
  '.cm-foldPlaceholder:hover': {
    backgroundColor: 'var(--klc-color-ui-hover)',
    color: 'var(--klc-color-ui-text)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-text) 4%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-text) 4%, transparent)',
    color: 'var(--klc-color-ui-text)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--klc-color-ui-accent)' },
  // 与 CodeMirror 默认规则同等具体，覆盖其聚焦时的亮色选区。
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--cm-selection-color)',
  },
  '& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--klc-color-ui-selection)',
  },
  '.cm-content ::selection, .cm-content::selection': {
    backgroundColor: 'var(--cm-selection-color)',
  },
  // 相同词使用低饱和背景与细边线，不覆盖原有语法文字颜色。
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-text) 10%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--klc-color-ui-text) 24%, transparent)',
    borderRadius: '2px',
  },
  '.cm-selectionMatch-main': { backgroundColor: 'transparent', boxShadow: 'none' },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--klc-color-ui-highlight)',
    outline: '1px solid var(--klc-color-ui-border)',
    borderRadius: '2px',
  },
  // 面板压在编辑区表面上：取 card 档，浅色与深色都与编辑区有差值，不会在深色里消失。
  '.cm-panels': {
    backgroundColor: 'var(--klc-color-ui-card)',
    color: 'var(--klc-color-ui-text)',
    border: 'none',
  },
  '.cm-panel.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--klc-space-8, 8px)',
    padding: 'var(--klc-space-12, 12px) 40px var(--klc-space-12, 12px) var(--klc-space-12, 12px)',
    fontFamily: 'var(--klc-typography-font-family)',
    fontSize: 'var(--klc-text-12-font-size, 12px)',
  },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
    margin: '0',
  },
  '.cm-panel.cm-search br': { flexBasis: '100%', height: '0' },
  '.cm-panel.cm-search .cm-textfield': {
    boxSizing: 'border-box',
    width: 'min(240px, 100%)',
    minWidth: '0',
    height: 'var(--klc-density-default, 32px)',
    padding: '0 var(--klc-space-8, 8px)',
    border: '1px solid var(--klc-color-ui-border)',
    borderRadius: 'var(--klc-radius-sm, 6px)',
    background: 'var(--klc-color-ui-input-background)',
    color: 'var(--klc-color-ui-text)',
    font: 'inherit',
    boxShadow: 'none',
    outline: 'none',
  },
  '.cm-panel.cm-search .cm-textfield::placeholder': { color: 'var(--klc-color-ui-muted)' },
  '.cm-panel.cm-search .cm-button': {
    minHeight: 'var(--klc-density-default, 32px)',
    padding: '0 var(--klc-space-12, 12px)',
    border: '0',
    borderRadius: 'var(--klc-radius-sm, 6px)',
    background: 'var(--klc-color-ui-control-background)',
    color: 'var(--klc-color-ui-text)',
    font: 'inherit',
    boxShadow: 'none',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search .cm-button:hover': { background: 'var(--klc-color-ui-hover)' },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--klc-space-4, 4px)',
    minHeight: 'var(--klc-density-default, 32px)',
    fontSize: 'inherit',
    color: 'var(--klc-color-ui-muted)',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search input[type=checkbox]': {
    margin: '0',
    accentColor: 'var(--klc-color-ui-accent)',
    width: '14px',
    height: '14px',
  },
  '.cm-panel.cm-search button[name=close]': {
    top: 'var(--klc-space-12, 12px)',
    right: 'var(--klc-space-8, 8px)',
    width: '24px',
    height: '32px',
    borderRadius: 'var(--klc-radius-xs, 4px)',
    color: 'var(--klc-color-ui-muted)',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search button[name=close]:hover': {
    background: 'var(--klc-color-ui-hover)',
    color: 'var(--klc-color-ui-text)',
  },
  '.cm-panel.cm-search button:focus-visible, .cm-panel.cm-search input[type=checkbox]:focus-visible':
    {
      outline: '2px solid var(--klc-color-ui-focus)',
      outlineOffset: '2px',
    },
  '.cm-tooltip': {
    backgroundColor: 'var(--klc-color-ui-surface)',
    color: 'var(--klc-color-ui-text)',
    border: '1px solid var(--klc-color-ui-border)',
    borderRadius: 'var(--klc-radius-md, 8px)',
    overflow: 'hidden',
  },
  // 参数提示：我们创建的节点自身就被 CodeMirror 标上 .cm-tooltip，复合选择器即可命中。
  '.cm-tooltip.cm-script-tooltip': tooltipBoxStyle,
  // hover 提示：CodeMirror 会另建一层 .cm-tooltip，我们的节点只是它内部的 .cm-tooltip-section，
  // 只有 :has() 能命中外层框体；两种形态各写一条，避免一种写法失效时另一种跟着失败。
  '.cm-tooltip:has(.cm-script-tooltip)': tooltipBoxStyle,
  // 两种形态都存在的内容节点，负责内边距与换行。
  '.cm-script-tooltip': {
    padding: 'var(--klc-space-4, 4px) var(--klc-space-8, 8px)',
    fontFamily: 'var(--klc-typography-font-family-mono)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    boxSizing: 'border-box',
  },
  '.cm-script-hover-description, .cm-script-hover-tags': {
    margin: 'var(--klc-space-8, 8px) 0 0',
    paddingTop: 'var(--klc-space-8, 8px)',
    borderTop: '1px solid var(--klc-color-ui-border)',
    fontFamily: 'sans-serif',
  },
  '.cm-script-hover-tags': {
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    gap: 'var(--klc-space-4, 4px) var(--klc-space-8, 8px)',
    whiteSpace: 'pre-wrap',
  },
  '.cm-script-hover-tags dt': { color: 'var(--klc-color-ui-muted)' },
  '.cm-script-hover-tags dd': { margin: '0', minWidth: '0' },
  '.cm-script-hover-documentation': { whiteSpace: 'normal' },
  '.cm-script-hover-documentation p': { margin: '0' },
  '.cm-script-hover-documentation p + p': { marginTop: 'var(--klc-space-8, 8px)' },
  '.cm-script-hover-documentation table': {
    borderCollapse: 'collapse',
    margin: 'var(--klc-space-8, 8px) 0',
  },
  '.cm-script-hover-documentation th, .cm-script-hover-documentation td': {
    border: '1px solid var(--klc-color-ui-border)',
    padding: 'var(--klc-space-4, 4px) var(--klc-space-8, 8px)',
    textAlign: 'left',
    verticalAlign: 'top',
  },
  '.cm-script-hover-documentation th': { backgroundColor: 'var(--klc-color-ui-surface)' },
  // 表格前面的参数、类型列保持完整，最后一列说明继续自动换行。
  '.cm-script-hover-documentation th:not(:last-child), .cm-script-hover-documentation td:not(:last-child)':
    {
      whiteSpace: 'nowrap',
      overflowWrap: 'normal',
    },
  '.cm-script-hover-documentation code': {
    fontFamily: 'var(--klc-typography-font-family-mono)',
  },
  '.cm-script-hover-signature .cm-editor': { display: 'block' },
  '.cm-script-hover-signature': { whiteSpace: 'pre-wrap' },
  '.cm-script-hover-documentation pre': {
    margin: 'var(--klc-space-8, 8px) 0',
    whiteSpace: 'pre-wrap',
  },
  // 补全列表约容纳 12 行，较小窗口中最多占视口的一半。
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    maxHeight: 'min(24em, 50vh)',
  },
  // 补全项的文档面板与悬浮提示共用同一份 JSDoc，同样限制尺寸并内部滚动。
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionInfo': {
    maxWidth: 'min(520px, 46vw)',
    maxHeight: 'min(24em, 50vh)',
    overflow: 'auto',
  },
  // 补全项上下各增加 1px 留白，保留默认左右间距与图标。
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    paddingTop: '2px',
    paddingBottom: '2px',
    cursor: 'pointer',
  },
  // 中文短名称使用 CodeMirror 原生 detail 栏，与插入的函数标识符分开显示。
  '.cm-tooltip-autocomplete .cm-completionDetail': {
    marginLeft: 'auto',
    paddingLeft: 'var(--klc-space-16, 16px)',
    color: 'var(--klc-color-ui-muted)',
    fontFamily: 'var(--klc-typography-font-family)',
    fontSize: '0.8em',
    fontWeight: 'var(--klc-text-label-12-font-weight, 500)',
    fontStyle: 'normal',
  },
  // 鼠标悬停显示界面 hover 色，键盘选中态保留更强的高亮。
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li:hover': {
    backgroundColor: 'var(--klc-color-ui-hover)',
    color: 'var(--klc-color-ui-text)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--klc-color-ui-selected)',
    color: 'var(--klc-color-ui-text)',
  },
  '.cm-tooltip-autocomplete .cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--klc-color-ui-accent)',
    // 只有 400/500 两档真实字面，600 只会得到合成粗体。
    fontWeight: '500',
  },
  '.cm-tooltip-autocomplete .cm-completionIcon-property': { display: 'none' },
  '.cm-script-property-icon svg': { verticalAlign: 'middle' },
  '.cm-script-property-icon svg path': { fill: 'currentColor', stroke: 'none' },
  '.cm-searchMatch': { backgroundColor: 'var(--klc-color-ui-selected)', outline: 'none' },
  '.cm-searchMatch-selected': { outline: '1px solid var(--klc-color-ui-accent)' },
  '.cm-button, .cm-textfield': {
    background: 'var(--klc-color-ui-control-background)',
    color: 'var(--klc-color-ui-text)',
    border: '1px solid var(--klc-color-ui-border)',
    borderRadius: 'var(--klc-radius-sm, 4px)',
  },
})

/** 编辑器共享样式扩展，CSS 变量变更时无需重建文档或视图。 */
export const scriptEditorTheme = editorTheme
