/** 运行时投影契约：一次状态快照及其固定执行阶段。 */
import type { IndicatorRuntimeInputs } from '@/engine/indicators/chartIndicatorManager.js'
import type { PaneAxisSpec } from '@/engine/pane/axisTypes.js'
import type { PaneSpec } from '@/engine/pane/types.js'
import type { PanePriceAxisRange } from '@/engine/state/axisState.js'
import type { UpdateLevel } from '@/engine/pane/index.js'

/** 同一次提交使用的业务输入；运行时对象不能反向决定归属。 */
export interface RuntimeProjectionSnapshot {
  readonly panes: readonly PaneSpec[]
  readonly axes: ReadonlyMap<string, readonly PaneAxisSpec[]>
  readonly indicators: IndicatorRuntimeInputs
  readonly ranges: Readonly<Record<string, PanePriceAxisRange>>
  readonly pricePaneId: string
  readonly leftAxisVisible: boolean
  readonly layoutOptions: unknown
}

/** 各模块只执行自己的阶段，跨模块调用顺序由协调者独占。 */
export interface RuntimeProjectionDependencies {
  capture(): RuntimeProjectionSnapshot
  projectPanes(snapshot: RuntimeProjectionSnapshot): void
  projectAxes(snapshot: RuntimeProjectionSnapshot): void
  configureAxes(snapshot: RuntimeProjectionSnapshot): void
  projectLayers(snapshot: RuntimeProjectionSnapshot): void
  invalidateFrame(): void
  requestDraw(level: UpdateLevel): void
}
