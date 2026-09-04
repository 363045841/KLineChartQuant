/** 视图工作区可恢复快照的领域类型。 */
import type { PaneSpec } from '../chartTypes'
import type { ScaleType } from '../utils/tickPosition'
import type { IndicatorInstanceInput } from './indicatorState'
import type { ChartWorkspaceId } from './modeState'

/** 单个视图工作区中需要跨会话恢复的用户配置。 */
export interface ViewWorkspaceSnapshot {
  readonly instances: ReadonlyArray<IndicatorInstanceInput>
  readonly paneRatios: Readonly<Record<string, number>>
  readonly paneSpecs: ReadonlyArray<PaneSpec>
  readonly paneScaleTypes: Readonly<Record<string, ScaleType>>
}

/** K 线与分时工作区的完整可恢复快照。 */
export type ViewWorkspacesSnapshot = Readonly<Record<ChartWorkspaceId, ViewWorkspaceSnapshot>>

/** 持久化适配器的最小契约；Chart 不依赖具体浏览器存储实现。 */
export interface ViewWorkspacePersistence {
  /** 合并连续的用户工作区变更。 */
  schedule(): void
  /** 在图表销毁前补写尚未落盘的变更。 */
  dispose(): void
}
