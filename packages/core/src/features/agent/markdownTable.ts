// 本文件提供 Agent 文本输出共用的紧凑 Markdown 表格渲染能力。
/** 表格无数据时的统一占位文本，避免向 Agent 输出空表格。 */
export const MARKDOWN_EMPTY_TEXT = '无可用数据'
// Markdown 表格的表头分隔符。
const TABLE_SEPARATOR = '---'

/** 转义表格单元格，缺失或非有限数值统一使用占位符。 */
export function escapeMarkdownCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  return String(value)
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ')
}

/** 按显式列序渲染紧凑 Markdown 表格；无列或无行时返回统一占位文本。 */
export function createMarkdownTable(
  columns: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): string {
  if (columns.length === 0 || rows.length === 0) return MARKDOWN_EMPTY_TEXT
  const header = `| ${columns.join(' | ')} |`
  const separator = `| ${columns.map(() => TABLE_SEPARATOR).join(' | ')} |`
  const body = rows.map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`)
  return [header, separator, ...body].join('\n')
}
