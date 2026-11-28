/**
 * 轴标签契约：生产者计算好的矢量化数据，由轴模块统一投影、避让与绘制。
 *
 * 只描述值与文本，不含画布或 DOM 类型，因此可以出现在渲染上下文里而不拉入宿主依赖。
 */
import type { Format } from '@363045841yyt/klinechart-plot-contracts'

/** 标签角色：刻度、贴边标签或标记点。 */
export type AxisLabelRole = 'tick' | 'tag' | 'marker'

/** 值轴（左轴 / 右轴）上的标签。 */
export interface ValueAxisLabel {
  readonly kind: 'value'
  /** 所属轴身份；必须存在于当前 Pane 的轴列表中。 */
  readonly axisId: string
  readonly role: AxisLabelRole
  /** 轴值域里的值：价格或百分比，量纲由所属轴的 scale type 决定，不是像素。 */
  readonly value: number
  /** 显示格式覆盖；缺省使用所属轴的显示单位与精度。 */
  readonly format?: Format
  /** 底色；缺省绘制为纯文字标签。 */
  readonly background?: string
  /** 第二行文字；当前仅最新价倒计时使用。 */
  readonly note?: string
}

/** 底部时间轴上的标签。 */
export interface TimeAxisLabel {
  readonly kind: 'time'
  readonly role: AxisLabelRole
  /** 连续逻辑槽位，落点由列投影换算。 */
  readonly index: number
  /** 已按周期格式化好的时间文本；粒度属于时间轴语义，不由值轴决定。 */
  readonly text: string
  readonly background?: string
  /** 年界主刻度加粗。 */
  readonly bold?: boolean
}

/** 单个轴标签。 */
export type AxisLabel = ValueAxisLabel | TimeAxisLabel
