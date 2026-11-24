// 轴宽估算的输入与输出契约，单位为逻辑像素。

export interface AxisWidths {
  /** 左轴最大列宽。 */
  left: number
  /** 各窗格右轴列宽总和的最大值；窗格之间共享同一右侧空间。 */
  right: number
  /** 右轴逐列宽度；键为轴身份。 */
  rightByAxis: Readonly<Record<string, number>>
}

/** 单条轴在本帧的标签宽度需求；宽度由轴标签模块按列估算。 */
interface AxisWidthInput {
  readonly axisId: string
  readonly paneId: string
  /** 静态相位（刻度、自由标签）所需宽度。 */
  readonly staticWidth: number
  /** 覆盖相位（最新价、十字线）所需宽度。 */
  readonly overlayWidth: number
  /** 左轴镜像刻度所需宽度；非主轴或非百分比语义为 0。 */
  readonly leftWidth: number
}

/** 一次轴宽估算的输入：每帧都是全量标签宽度。 */
export interface AxisWidthFrame {
  readonly axes: ReadonlyArray<AxisWidthInput>
}

/** 单条轴在右轴画布内的列布局。 */
export interface AxisColumnLayout {
  readonly left: number
  readonly width: number
}
