/** 视图横向模型契约：策略、输入与所有消费者共享的不可变投影。 */

import type { SymbolSpec } from '../../controllers/types.js'
import type { TimeShareRange } from '../../data/provider/types.js'
import type { SlotGrid } from '../../foundation/geometry/slotGrid.js'
import type { FiveDayTimeShareGeometry } from '../../foundation/plugin/index.js'
import type { ChartDataView } from '../../foundation/types/chartView.js'
import type { ChartSeriesDatum } from '../../foundation/types/price.js'
import type { MarketSessionConfig } from '../../foundation/utils/timeShareAxisLabels.js'

export interface ViewInput {
  view: ChartDataView
  width: number
  dpr: number
  kWidth: number
  sessionSlotWidth: number | null
  data: ReadonlyArray<ChartSeriesDatum>
  dataLength: number
  marketSession: MarketSessionConfig | null
  timeShareRange: TimeShareRange | null
  scroll: number
}

export interface ViewCapabilities {
  allowPan: boolean
  allowZoom: boolean
  allowVerticalScroll: boolean
  allowRightAxisScale: boolean
}

export interface ViewSnapshot {
  view: ChartDataView
  ready: boolean
  grid: SlotGrid
  scroll: number
  domOffset: number
  /** 当前几何允许的逻辑滚动区间，导航与缩放共用。 */
  scrollBounds: { min: number; max: number }
  domScroll: number
  contentWidth: number
  seriesWidth: number
  viewportWidth: number
  kWidth: number
  kGap: number
  kWidthPx: number
  range: { start: number; end: number }
  slotRange: { start: number; end: number }
  centers: number[]
  positions: number[]
  bars: Array<{ x: number; width: number }>
  fiveDayGeometry: FiveDayTimeShareGeometry | null
  capabilities: Readonly<ViewCapabilities>
  hoverKind: 'candle' | 'point'
  /** 主序列是否携带 OHLC；分时只有价格点，不参与价格极值与倒计时派生。 */
  hasPriceSeries: boolean
  /** 数据索引与坐标转换由当前策略提供，空白槽位不伪造行情。 */
  worldAtIndex: (index: number) => number | null
  indexAtWorld: (world: number) => number | null
}

export interface ViewStrategy {
  requiresMarketSession: boolean
  capabilities: Readonly<ViewCapabilities>
  project: (input: ViewInput) => ViewSnapshot
  zoomInput: (input: ViewInput, delta: number, kWidth: number) => ViewInput
  navigate: (snapshot: ViewSnapshot, requested: number) => number
}

/** 视图切换的唯一裁决输入。 */
export interface ViewTransitionInput {
  period: string | undefined
}

/** 视图切换结果，供工作区与数据加载入口消费。 */
export interface ViewTransition {
  dataView: ChartDataView
  timeShare: boolean
}
