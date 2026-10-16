/** 图表 Plot 契约：指标声明绘图方式，帧投影提供统一的数值范围。 */
import type {
  ArrowOptions,
  CharOptions,
  PlotCollection,
  PlotKind,
  ShapeOptions,
  ShapeSize,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ColorTokens } from '@/foundation/tokens/index.js'

export type {
  ArrowPlot,
  CharPlot,
  Plot,
  PlotCollection,
  PlotFill,
  PlotPoint,
  ShapePlot,
} from '@363045841yyt/klinechart-plot-contracts'
export {
  PlotKind,
  ShapeLocation,
  ShapeSize,
  ShapeStyle,
} from '@363045841yyt/klinechart-plot-contracts'

/** 计算器的数组字段或按周期索引的序列。 */
export interface PlotSource {
  readonly field?: string
  readonly seriesKey?: string
  readonly periodParam?: string
}

/** 指标只描述绘图配置，不负责坐标转换或实际绘制。 */
export interface PlotSpec extends PlotSource, ShapeOptions, CharOptions, ArrowOptions {
  readonly id: string
  readonly label?: string | ((params: Readonly<Record<string, unknown>>) => string)
  readonly kind?: PlotKind
  readonly show?: string
  readonly color: (colors: ColorTokens) => string
  readonly pointColor?: (
    value: number,
    previous: number | undefined,
    colors: ColorTokens,
    raw: unknown,
  ) => string
  readonly offset?: (params: Readonly<Record<string, unknown>>) => number
  /** 图形尺寸档位；histogram 也可用数值指定固定像素柱宽，缺省 auto。 */
  readonly size?: ShapeSize | number
  readonly dash?: readonly number[]
  readonly baseline?: number
}

export interface PlotFillSpec {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly show?: string
  readonly color: (colors: ColorTokens) => string
  readonly reverseColor: (colors: ColorTokens) => string
  readonly opacity?: number
}

export interface PlotGuide {
  readonly value: number
  readonly color: (colors: ColorTokens) => string
  readonly dash?: readonly number[]
}

export interface IndicatorPlotDefinition {
  /** collection 表示计算器已输出完整 Plot，无需提取数值字段。 */
  readonly source?: 'collection'
  readonly series: readonly PlotSpec[]
  readonly fills?: readonly PlotFillSpec[]
  readonly guides?: readonly PlotGuide[]
  readonly range?: {
    readonly min?: number
    readonly max?: number
    readonly mode?: 'fixed' | 'include' | 'clamp'
  }
  readonly padding?: number
}

/** 所有普通指标共用的帧数据模型。 */
export interface PlotRenderState extends PlotCollection {
  readonly kind: 'plots'
  readonly timestamp: number
  readonly params: Readonly<Record<string, unknown>>
  readonly valueMin: number
  readonly valueMax: number
  readonly visibleMin: number
  readonly visibleMax: number
  readonly guides: readonly {
    readonly value: number
    readonly color: string
    readonly dash: readonly number[]
  }[]
}
