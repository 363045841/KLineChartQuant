/** DOM 图例渲染器生命周期契约，业务数据由 legend 模块提供。 */
import type { LegendRow } from '@/engine/legend/types.js'

/** 一个 pane 的图例行快照。 */
export interface LegendPaneFrame {
  readonly paneId: string
  readonly rows: ReadonlyArray<LegendRow>
}

/** 一帧图例投影：行按 pane 分组，收起状态由 Core 决定。 */
export interface LegendDomFrame {
  readonly rowsByPane: ReadonlyArray<LegendPaneFrame>
  readonly mainCollapsed: boolean
  readonly canCollapse: boolean
}

export interface LegendDomRenderer {
  update(frame: LegendDomFrame): void
  clear(): void
  dispose(): void
}
