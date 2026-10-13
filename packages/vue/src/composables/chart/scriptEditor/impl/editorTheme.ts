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
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-accent) 22%, transparent)',
  },
  '& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-accent) 12%, transparent)',
  },
  '.cm-content ::selection, .cm-content::selection': {
    backgroundColor: 'color-mix(in srgb, var(--klc-color-ui-accent) 22%, transparent)',
  },
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
  // 类型悬浮框和参数提示共用卡片布局，避免长签名贴边并覆盖整行代码。
  '.cm-tooltip.cm-tooltip-hover, .cm-tooltip:has(.cm-script-signature)': {
    maxWidth: 'min(560px, 80vw)',
    backgroundColor: 'var(--klc-color-ui-control-background)',
    fontSize: 'var(--klc-text-label-13-font-size, 13px)',
    lineHeight: '1.6',
  },
  '.cm-tooltip-hover > div, .cm-script-signature': {
    padding: 'var(--klc-space-4, 4px) var(--klc-space-8, 8px)',
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: 'min(280px, 40dvh)',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  '.cm-tooltip-hover .quick-info-keyword': { color: 'var(--klc-color-ui-accent)' },
  '.cm-tooltip-hover .quick-info-punctuation, .cm-tooltip-hover .quick-info-text': {
    color: 'var(--klc-color-ui-muted)',
  },
  '.cm-tooltip-hover .quick-info-propertyName, .cm-tooltip-hover .quick-info-methodName': {
    fontWeight: '500',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--klc-color-ui-selected)',
    color: 'var(--klc-color-ui-text)',
  },
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
