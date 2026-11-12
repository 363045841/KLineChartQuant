/**
 * 单帧图表坐标契约：时间是事实，逻辑槽位、像素与 Pane 价格都是当前视图的投影。
 *
 * 时间轴、绘图投影、命中与拖拽共享同一个实现；数据两端按常规槽距外推。
 */
export interface FrameCoordinates {
  /** 本帧序列的常规槽距（毫秒）；0 表示无法统计。 */
  readonly seriesInterval: number
  /** 毫秒时间戳映射为连续逻辑位置；真实行情之间插值，两端按常规槽距外推。 */
  timeToLogical(timestamp: number): number | null
  /** 跨周期绘图使用的最近整数槽位；仅派生位置，不改变原始时间。 */
  timeToSlot(timestamp: number): number | null
  /** 连续逻辑位置映射为毫秒时间戳；与 timeToLogical 使用同一组节点，两端同样外推。 */
  logicalToTime(index: number): number | null
  /** 整数槽位时间；未来槽位是常规槽距的推算开盘，真实行情覆盖后由同一时间重新定位。 */
  slotToTime(index: number): number | null
  /** 连续逻辑位置映射为 Pane 局部横坐标。 */
  logicalToX(index: number): number | null
  /** Pane 局部横坐标反算为连续逻辑位置。 */
  xToLogical(x: number): number | null
  /** 指针横坐标吸附到当前视图最近槽位，和跨周期时间吸附共用取整规则。 */
  xToSlot(x: number): number | null
  /** 价格映射为 Pane 局部纵坐标，遵循当前价格轴类型。 */
  priceToY(price: number): number | null
  /** Pane 局部纵坐标反算为价格。 */
  yToPrice(y: number): number | null
}
