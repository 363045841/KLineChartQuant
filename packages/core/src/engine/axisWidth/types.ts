// 轴宽估算的输入与输出契约，单位为逻辑像素。
import type { AxisLabelsFrame } from '../../foundation/plugin/types.js'

export interface AxisWidths {
  /** 左轴最大列宽。 */
  left: number
  /** 各窗格右轴列宽总和的最大值；窗格之间共享同一右侧空间。 */
  right: number
  /** 右轴逐列宽度；键为派生 axisId。 */
  rightByAxis: Readonly<Record<string, number>>
}

export interface AxisWidthFrame {
  labels: AxisLabelsFrame
  /** 当前帧全部轴；同一 Pane 的多条轴各自成列。 */
  axes: ReadonlyArray<{ readonly axisId: string; readonly paneId: string }>
  updateStatic: boolean
  updateOverlay: boolean
}

/** 单条轴在右轴画布内的列布局。 */
export interface AxisColumnLayout {
  readonly left: number
  readonly width: number
}
