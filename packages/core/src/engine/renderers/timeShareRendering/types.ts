/** 分时投影契约：保留世界 X 与屏幕 Y，样式和滚动量在原语提交时绑定。 */
import type { PrimitiveFade, PrimitivePath } from '@/rendering/primitives/types.js'

export interface TimeShareAreaProjection extends PrimitiveFade {
  readonly paths: readonly PrimitivePath[]
}

export interface TimeShareSegmentProjection {
  readonly price: PrimitivePath
  readonly average: PrimitivePath
  readonly up: TimeShareAreaProjection | null
  readonly down: TimeShareAreaProjection | null
}

export interface TimeShareProjection {
  readonly baselines: readonly PrimitivePath[]
  readonly segments: readonly TimeShareSegmentProjection[]
}
