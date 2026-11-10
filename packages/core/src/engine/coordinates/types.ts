/** 图表公开坐标契约；时间与价格是事实，索引与 Pane 局部像素是当前视图的投影。 */
export interface DrawingCoordinateApi {
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
