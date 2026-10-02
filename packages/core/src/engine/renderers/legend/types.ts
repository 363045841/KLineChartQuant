/** Legend DOM 渲染的数据契约与低频用户操作事件。 */
export interface LegendText {
  text: string
  color: string
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
}

export const LEGEND_ACTION_EVENT = 'klc:legend-action'
export type LegendAction = 'move-up' | 'move-down' | 'replace' | 'close'
export interface LegendActionDetail {
  action: LegendAction
  paneId: string
  definitionId: string
}

export interface LegendDomRenderer {
  update(paneId: string, rows: ReadonlyArray<LegendRow>, paneOrder: ReadonlyArray<string>): void
  clear(): void
  dispose(): void
}
