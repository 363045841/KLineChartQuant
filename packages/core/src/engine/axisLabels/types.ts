/**
 * 轴标签管理模块对外契约：单帧轴标签收集、注册与统一绘制的形状。
 *
 * ready-to-draw 标签数据（`AxisLabel`）与帧聚合契约（`AxisLabelsFrame`）声明在
 * foundation（`foundation/plugin/types.ts`），以保持 foundation 不反向依赖 engine；
 * 本文件按模块公开面重导出，并补充模块自有的绘制度量契约。实现位于 `axisLabels/impl/`。
 */

export type {
  AxisLabel,
  AxisLabelCollector,
  AxisLabelSurface,
  AxisLabelsFrame,
  AxisTagLabel,
  AxisTickLabel,
} from '../../foundation/plugin/types.js'

/** 绘制单个表面轴标签所需的画布度量。 */
export interface AxisLabelMetrics {
  /** 设备像素比，用于物理像素对齐。 */
  dpr: number
  /** 轴横向尺寸（逻辑像素）：X 表面为可视宽，Y 表面为轴宽。 */
  axisWidth: number
  /** 轴纵向尺寸（逻辑像素）：X 表面为轴高，Y 表面为 Pane 高。 */
  axisHeight: number
}
