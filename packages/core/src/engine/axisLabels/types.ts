/**
 * 轴标签模块对外契约：标签数据、来源接口、帧快照、列几何与列投影。
 *
 * 三条不变式：
 * - 生产者只表达轴值域里的值（价格 / 逻辑槽位），不表达像素；投影、格式化、
 *   重叠避让与物理像素对齐全部在模块内完成，「同一个位置两种坐标空间」写不出来。
 * - 每帧一次全量快照；不在 Layer.paint 内注册，标签与更新级别、图层可见性无关。
 * - 标签不携带画布身份：静态/覆盖相位由 role 决定，左右列由列几何决定，
 *   轴归属由 axisId 决定，生产者都不参与。
 */

import type { Format } from '@363045841yyt/klinechart-plot-contracts'
import type { PaneAxisSpec } from '@/engine/pane/axisTypes.js'
import type {
  IndicatorRenderStateReader,
  PaneInfo,
  RenderThemeContext,
  TimeShareGeometry,
  YAxisTick,
} from '@/foundation/plugin/index.js'
import type { TimeFormatter, TimeTick } from '@/foundation/time/index.js'
import type { ChartDataView } from '@/foundation/types/chartView.js'
import type { ChartSeriesDatum } from '@/foundation/types/price.js'
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'

/** 底部时间轴在图表内唯一，不参与 Pane 的轴列。 */
export const TIME_AXIS = 'time'

/**
 * 标签行为角色，唯一决定绘制相位与是否参与重叠避让。
 *
 * - tick：刻度标签，不参与避让，可被带底色的标签覆盖；
 * - tag：带底色的自由标签（指标输出、参考线、选中图元），按锚点排序参与避让；
 * - marker：钉在真实锚点上的标签（最新价、十字线），不参与避让。
 */
import type { AxisLabel, AxisLabelRole } from '../../foundation/types/axisLabel.js'

export type {
  AxisLabel,
  AxisLabelRole,
  TimeAxisLabel,
  ValueAxisLabel,
} from '../../foundation/types/axisLabel.js'

/** 轴列投影：把标签锚点映射为列内像素与显示文本，由调用方按列构造。 */
export type AxisColumnProjection =
  | {
      readonly kind: 'value'
      /** 轴值 → 列内纵坐标。 */
      readonly yFor: (value: number) => number
      /** 轴值 → 文本；format 为该标签的显示格式覆盖。 */
      readonly textFor: (value: number, format?: Format) => string
    }
  | {
      readonly kind: 'time'
      /** 连续逻辑槽位 → 列内横坐标。 */
      readonly xFor: (index: number) => number
    }

/** 单个轴列的文字色：标签模块负责选择，调用方只提供当前主题的两个角色。 */
export interface AxisColumnPalette {
  /** 纯文字标签（刻度）的文字色。 */
  readonly text: string
  /** 带底色标签的文字色。 */
  readonly onBackground: string
}

/** 单条轴列（右轴一列 / 左轴一列 / 底部时间轴）的绘制输入，长度单位均为逻辑像素。 */
export interface AxisColumn {
  /** 设备像素比，用于物理像素对齐。 */
  readonly dpr: number
  /** 列宽（Y 轴）或可视宽（时间轴）。 */
  readonly width: number
  /** 列高（Y 轴等于 Pane 高）或轴高（时间轴）。 */
  readonly height: number
  /** 多列右轴中的列左偏移；单列与时间轴为 0。 */
  readonly offsetX: number
  readonly projection: AxisColumnProjection
  readonly palette: AxisColumnPalette
}

/**
 * 单帧轴标签快照：按轴身份取该轴的全部标签。
 *
 * 只读；每帧由 `collectAxisLabels` 新建，帧结束后随对象释放。
 */
export interface AxisLabelsFrame {
  /** 取指定轴的全部标签；时间轴使用 `TIME_AXIS`。 */
  forAxis(axisId: string): readonly AxisLabel[]
}

/** 收集一帧标签所需的输入；每个字段都对应一个明确的消费者。 */
export interface AxisLabelScope {
  /** 所属窗格：轴坐标映射与显示范围（刻度、十字线、最新价）。 */
  readonly pane: PaneInfo
  /** 本帧轴规格：可见性、显示单位、精度与对象绑定（刻度、十字线、指标输出）。 */
  readonly axes: readonly PaneAxisSpec[]
  /** 本帧每轴刻度：网格与轴标签共用同一份结果，不各自重算。 */
  readonly axisTicks: ReadonlyMap<string, readonly YAxisTick[]>
  /** 本帧行情数据：最新价取最后一根，分时时间刻度取逐槽时间。 */
  readonly data: readonly ChartSeriesDatum[]
  readonly dataView: ChartDataView
  readonly period: string
  /** 展示时间格式化（时间轴刻度与十字线时间签）。 */
  readonly timeFormatter: TimeFormatter
  /** 市场时段：分时十字线时间按交易所时区（十字线时间签）。 */
  readonly marketSession?: MarketSessionConfig
  /** 世界横坐标 → 连续逻辑槽位；五日分时的交易日标签按几何中心定位。 */
  readonly worldXToLogical: (worldX: number) => number | null
  /** 本帧时间刻度：文本、主刻度与落点槽位（时间轴刻度）。 */
  readonly timeTicks: readonly TimeTick[]
  /** 五日分时的交易日几何（时间轴刻度）。 */
  readonly timeShareGeometry?: TimeShareGeometry
  /** 时间轴可视宽：分时按可用宽度选择标签位置。 */
  readonly timeAxisWidth: number
  /** 十字线位置；整帧唯一的指针位置，y 为图表纵坐标，index 为逻辑槽位。 */
  readonly crosshair: { readonly y: number; readonly index: number } | null
  /** 当前 Pane 是否为活动 Pane；只有活动 Pane 出十字线价签。 */
  readonly active: boolean
  /** 当前生效的绘图轴标签：正式投影 + 拖动会话投影在边界合并，来源不感知投影拆分。 */
  readonly drawingLabels: readonly AxisLabel[]
  /** 逻辑槽位 → 时间戳；十字线时间文本使用。 */
  readonly logicalToTime: (index: number) => number | null
  /** 指标渲染状态：取每个输出最后一个有效值（指标输出标签）。 */
  readonly indicatorState: IndicatorRenderStateReader
  /** 主题与配色覆盖：标签底色与文字色。 */
  readonly theme: RenderThemeContext
  /** 本帧收盘倒计时文本；最新价标签第二行。 */
  readonly countdown: string | null
}

/**
 * 标签来源：把本帧状态翻译成标签数据。
 *
 * 实现必须是纯函数：只读 scope，不碰画布、不修改入参、不跨帧保存状态。
 */
export interface AxisLabelSource {
  collect(scope: AxisLabelScope): readonly AxisLabel[]
}
