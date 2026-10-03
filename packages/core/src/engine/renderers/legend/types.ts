/** Legend DOM 渲染的数据契约与低频用户操作事件。 */
export interface LegendText {
  text: string
  color: string
  /** 与前一段文本的间距（像素），未指定时使用行间距。 */
  gapBefore?: number
}

export interface LegendRow {
  key: string
  paneId: string
  x: number
  y: number
  maxWidth: number
  height: number
  gap: number
  texts: ReadonlyArray<LegendText>
  indicator?: { instanceId: string; definitionId: string }
  /** 指标被隐藏：行保留并置灰，工具条切换为“显示指标”。 */
  hidden?: boolean
}

export const LEGEND_ACTION_EVENT = 'klc:legend-action'
export type LegendAction =
  | 'move-up'
  | 'move-down'
  | 'replace'
  | 'toggle-visibility'
  | 'settings'
  | 'close'
export interface LegendActionDetail {
  action: LegendAction
  paneId: string
  definitionId: string
  /** 仅 toggle-visibility：切换后的目标隐藏状态。 */
  hidden?: boolean
}

export interface LegendDomRenderer {
  update(paneId: string, rows: ReadonlyArray<LegendRow>, paneOrder: ReadonlyArray<string>): void
  clear(): void
  dispose(): void
}
