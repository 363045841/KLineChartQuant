/** 指标计算时间轴到当前展示时间轴的只读投影契约。 */
export interface IndicatorTimelineProjection {
  readonly identity: boolean
  /** 将计算时的逻辑坐标定位到当前时间轴；对应 bar 已不存在时返回 NaN。 */
  projectIndex(index: number): number
  /** 按 bar 时间身份重排数据列；未计算的展示位置留空。 */
  projectArray<T>(values: readonly T[]): readonly (T | undefined)[]
}
