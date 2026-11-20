/** 柱状图几何契约：世界坐标保留双精度，屏幕坐标只在绘制前生成。 */
export interface WorldRectBatch {
  readonly buf: Float64Array
  readonly count: number
  readonly color: string
}
