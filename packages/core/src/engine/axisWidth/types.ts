// 轴宽估算的输入与输出契约，单位为逻辑像素。
import type { AxisLabelsFrame } from '../../foundation/plugin/types.js'

export interface AxisWidths {
  left: number
  right: number
}

export interface AxisWidthFrame {
  labels: AxisLabelsFrame
  paneIds: readonly string[]
  updateStatic: boolean
  updateOverlay: boolean
}
