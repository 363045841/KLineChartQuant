/** DOM 图例渲染器生命周期契约，业务数据由 legend 模块提供。 */
import type { LegendRow } from '@/engine/legend/types.js'

export interface LegendDomRenderer {
  update(paneId: string, rows: ReadonlyArray<LegendRow>, paneOrder: ReadonlyArray<string>): void
  clear(): void
  dispose(): void
}
