/** CodeMirror 界面消费图表 Token，语法高亮使用官方 One Dark 配色。 */
import { syntaxHighlighting } from '@codemirror/language'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'

/** 编辑区、行号、选区和补全面板共用图表的界面颜色。 */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--klc-color-ui-surface)',
    color: 'var(--klc-color-ui-text)',
    fontSize: 'var(--klc-text-label-13-font-size, 13px)',
    fontWeight: '400',
    // 行高同时驱动正文行与折叠标记高度，避免两处各写一份。
    '--cm-line-height': '1.8',
    '--cm-selection-color': 'color-mix(in srgb, var(--klc-color-ui-accent) 42%, transparent)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono'",
    lineHeight: 'var(--cm-line-height)',
    overflow: 'auto',
  },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--klc-color-ui-accent)' },
  '.cm-line': { padding: '0 20px 0 14px' },
  '.cm-gutters': {
    backgroundColor: 'var(--klc-color-ui-surface)',
    color: 'var(--klc-color-ui-muted)',
    border: 'none',
    borderRight: '1px solid var(--klc-color-ui-border)',
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
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-accent) 26%, transparent)',
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
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-accent) 14%, transparent)',
    outline: '1px solid var(--klc-color-ui-border)',
    borderRadius: '2px',
  },
  '.cm-panels, .cm-tooltip': {
    backgroundColor: 'var(--klc-color-ui-surface)',
    color: 'var(--klc-color-ui-text)',
    border: '1px solid var(--klc-color-ui-border)',
  },
  '.cm-tooltip': {
    borderRadius: 'var(--klc-radius-md, 8px)',
    overflow: 'hidden',
  },
  // 类型悬浮框和参数提示随内容确定尺寸。
  '.cm-tooltip.cm-tooltip-hover, .cm-tooltip:has(.cm-script-signature)': {
    backgroundColor: 'var(--klc-color-ui-surface)',
    fontSize: 'var(--klc-text-label-13-font-size, 13px)',
    lineHeight: '1.6',
  },
  '.cm-tooltip-hover > div, .cm-script-signature': {
    padding: 'var(--klc-space-4, 4px) var(--klc-space-8, 8px)',
    fontFamily: "'JetBrains Mono', monospace",
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
  '.cm-script-hover-documentation code': { fontFamily: "'JetBrains Mono', monospace" },
  // 提示内只读代码保留语法高亮，取消正文编辑区的高度、边距和活动交互外观。
  '.cm-script-hover .cm-editor': {
    height: 'auto',
    display: 'inline-block',
    backgroundColor: 'transparent',
    verticalAlign: 'baseline',
    fontSize: 'inherit',
  },
  '.cm-script-hover .cm-content': { padding: '0', caretColor: 'transparent' },
  '.cm-script-hover .cm-line': { padding: '0' },
  '.cm-script-hover .cm-scroller': { overflow: 'visible', lineHeight: 'inherit' },
  '.cm-script-hover-signature .cm-editor': { display: 'block' },
  '.cm-script-hover-signature': { whiteSpace: 'pre-wrap' },
  '.cm-script-hover-documentation pre': {
    margin: 'var(--klc-space-8, 8px) 0',
    whiteSpace: 'pre-wrap',
  },
  // 补全项上下各增加 1px 留白，保留默认左右间距与图标。
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    paddingTop: '2px',
    paddingBottom: '2px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-accent) 22%, transparent)',
    color: 'var(--klc-color-ui-text)',
  },
  '.cm-tooltip-autocomplete .cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--klc-color-ui-accent)',
    fontWeight: '600',
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
export const scriptEditorTheme = [editorTheme, syntaxHighlighting(oneDarkHighlightStyle)]
