/** 图表公开坐标契约；时间与价格是事实，索引与 Pane 局部像素是当前视图的投影。 */
export interface DrawingCoordinateApi {
  /** 毫秒时间戳映射为连续逻辑位置；缺少所需行情或未来日历时返回 null。 */
  timeToLogical(timestamp: number): number | null
  /** 跨周期绘图使用的最近整数槽位；仅派生位置，不改变原始时间。 */
  timeToSlot(timestamp: number): number | null
  /** 连续逻辑位置映射为毫秒时间戳；不推测未知的未来交易时段。 */
  logicalToTime(index: number): number | null
  /** 当前周期的整数槽位开盘时间；必须有真实行情或日历，不能把收盘边界当成未来开盘。 */
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
