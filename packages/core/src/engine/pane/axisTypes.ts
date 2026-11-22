/** 对外统一 Y 轴 API；所有查询、配置和交互以独立轴身份寻址。 */

import type { PriceAxisRangeMode } from '@/foundation/config/priceAxisRangeMode.js'
import type { ObjectAxisBinding } from '@/foundation/geometry/axisBinding.js'
import type { PaneInfo, RenderContext } from '@/foundation/plugin/types.js'
import type { ScaleType } from '@/foundation/types/scaleType.js'
import type { PriceScale } from '../scale/index.js'
import type { AxisStateModule } from '../state/axisState.js'
import type { PaneStateModule } from '../state/paneState.js'

/** 单条轴的配置。 */
export interface AxisSpec {
  readonly paneId: string
  readonly axisId: string
  readonly decimals: number
  readonly visible: boolean
  readonly scaleType: ScaleType
  readonly format?: (value: number) => string
}

/** 行情序列或指标对所在量纲轴的声明。 */
export interface ObjectAxisSpec extends AxisSpec, ObjectAxisBinding {}

/** 按量纲合并后的窗格轴；仅绘图窗格的轴没有数据对象。 */
export interface PaneAxisSpec extends AxisSpec {
  readonly objectIds: readonly string[]
}

/** 统一轴 API 所需端口；实现不直接依赖 Chart 或指标管理器。 */
export interface ObjectAxesDependencies {
  listBindings(): ReadonlyArray<ObjectAxisBinding>
  getAxisPaneId(axisId: string): string | undefined
  getPane(paneId: string): { axis(axisId: string): PriceScale } | undefined
  getLayout(
    paneId: string,
  ): Readonly<Record<string, { readonly left: number; readonly width: number }>>
  /** 该轴在当前视图下可用的范围模式；校验与配置读数共用这一份。 */
  availableRangeModes(axisId: string): readonly PriceAxisRangeMode[]
  paneState: PaneStateModule
  ranges: AxisStateModule
  project(): void
}

export interface ObjectAxesApi {
  list(): ReadonlyArray<ObjectAxisBinding>
  /** 未注册对象或轴均抛异常，不选择其他对象的轴。 */
  bindingFor(objectId: string): ObjectAxisBinding
  get(axisId: string): PaneInfo['yAxis']
  configuration(axisId: string): {
    readonly scaleType: ScaleType
    readonly rangeMode: PriceAxisRangeMode
    /** 当前视图下该轴可选的范围模式；宿主按此渲染，不自行判断。 */
    readonly availableRangeModes: readonly PriceAxisRangeMode[]
    readonly baseValue: number | null
  }
  /** 百分比变换需要非零基准值；轴尚无基准时调用方必须显式提供。 */
  setScaleType(axisId: string, type: ScaleType, baseValue?: number): void
  setRangeMode(axisId: string, mode: PriceAxisRangeMode): void
  resetRange(axisId: string): void
  translate(axisId: string, deltaY: number): void
  scale(axisId: string, deltaY: number, anchorY?: number): void
  /** 按提交后的轴列位置命中目标；列外返回 null，不选择其他轴。 */
  hitTest(paneId: string, x: number): string | null
}

/** 轴帧入口只收集刻度和标签；统一绘制阶段消费结果，业务层不清轴。 */
export interface AxisFrameApi {
  collect(
    context: RenderContext,
    axes: ReadonlyArray<PaneAxisSpec>,
    crosshair: { y: number; activePaneId: string | null } | null,
  ): void
}
