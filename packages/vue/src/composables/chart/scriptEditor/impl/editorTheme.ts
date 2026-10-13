/** CodeMirror 主题：颜色与字体统一消费图表 Token，随深浅主题自动切换。 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/** 编辑区、行号、选区和补全面板共用图表的界面颜色。 */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--klc-color-ui-surface)',
    color: 'var(--klc-color-ui-text)',
    fontSize: 'var(--klc-text-label-13-font-size, 13px)',
    fontWeight: '400',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono'",
    lineHeight: '1.8',
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
  '.cm-tooltip': { borderRadius: 'var(--klc-radius-md, 8px)', overflow: 'hidden' },
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

/** 覆盖默认亮色高亮，避免深色背景上出现低对比度的蓝色和红色。 */
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--klc-color-ui-accent)' },
  { tag: [tags.string, tags.regexp], color: 'var(--klc-color-performance-positive)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--klc-color-ui-accent)' },
  { tag: tags.comment, color: 'var(--klc-color-ui-muted)', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: 'var(--klc-color-ui-text)', fontWeight: '500' },
  { tag: [tags.variableName, tags.propertyName], color: 'var(--klc-color-ui-text)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--klc-color-ui-muted)' },
  { tag: tags.invalid, color: 'var(--klc-color-performance-negative)' },
])

/** 编辑器共享样式扩展，CSS 变量变更时无需重建文档或视图。 */
export const scriptEditorTheme = [editorTheme, syntaxHighlighting(highlight)]
