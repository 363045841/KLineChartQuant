/**
 * mainIndicatorLegend 子模块对外契约：主图图例的行数据、布局与配置。
 *
 * 仅存放跨模块引用或被公开 API 暴露的类型；构建与绘制实现留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { TitleValueItem } from '@/engine/indicators/indicatorMetadata.js'
import type { KLineData } from '@/foundation/types/price.js'

/** 图例行的像素布局，由构建阶段按帧算出。 */
export interface LegendLayout {
  x: number
  y: number
  lineHeight: number
  gap: number
  paneWidth: number
  compact: boolean
}

/** 当前 K 线及图例派生的展示字段，保留 KLineData 自定义属性。 */
export type LegendCurrentBar = Omit<KLineData, 'volume'> & {
  volume: number | null
  // 成交量+单位格式化文本(eg. 1.23亿)
  volumeText: string | null
  color: string
}

export interface LegendTimeshareRow {
  price: number
  average: number
  changeAmount: number
  changePercent: number
  volume: number | null
  /** 带手数单位的成交量文本。 */
  volumeText: string | null
  amount: number | null
  amountText: string | null
  changeColor: string
}

export interface LegendIndicatorRow {
  /** 实例身份，用于 Legend 命中后的操作。 */
  instanceId: string
  /** 指标规范 ID（displayName），与可见集合、实例目录同一身份空间。 */
  definitionId: string
  /** 隐藏的指标图例保留并置灰。 */
  hidden: boolean
  name: string
  params?: number[]
  values?: TitleValueItem[]
}

export interface LegendComparisonRow {
  symbol: string
  name?: string
  percent: number
  color: string
  percentColor: string
}

/**
 * 主图左上角图例完整上下文。
 * DOM renderer 与自定义 legend slot 共用同一份数据。
 */
export interface LegendTemplateContext {
  period: string
  index: number
  hasCrosshair: boolean
  layout: LegendLayout
  colors: {
    textPrimary: string
    textTertiary: string
    up: string
    down: string
  }
  /** 十字线指向的当前 K 线展示行（含 volumeText / color 与自定义字段） */
  currentBar: LegendCurrentBar | null
  timeshare: LegendTimeshareRow | null
  indicators: ReadonlyArray<LegendIndicatorRow>
  comparisons: ReadonlyArray<LegendComparisonRow>
  /** 当前索引处的原始 K 线（分时模式下可能无 close） */
  bar: KLineData | null
}

/** 主图图例公开配置，保留现有配置入口。 */
export interface LegendOptions {
  visible?: boolean
  visibleIndicatorIds?: ReadonlyArray<string>
}

export interface MainIndicatorLegendOptions {
  yPaddingPx: number
  onContext?: (ctx: LegendTemplateContext | null) => void
  /** 当前数据视图应显示的主图指标规范 ID；缺省表示不过滤。 */
  getVisibleIndicatorIds?: () => ReadonlyArray<string>
  getLegendOptions?: () => LegendOptions | undefined
}
