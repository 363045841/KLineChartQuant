/** 柱状图几何契约：世界坐标保留双精度，屏幕坐标只在绘制前生成。 */
export interface WorldRectBatch {
  readonly buf: Float64Array
  readonly count: number
  readonly color: string
}

export interface ScreenRectBatch {
  /** 整数屏幕物理像素，避免非整数 DPR 在 Float32 中再次损失精度。 */
  readonly buf: Float32Array
  readonly count: number
  readonly color: string
}
