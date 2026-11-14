/**
 * Y 轴量纲组：对象先归组，组才是 Pane 内的一条轴。
 *
 * 合并只按"量纲"这一事实合并，不做幅值比较：价格类对象共用价格轴，同一指标定义
 * 的实例共用一条轴；不同定义各自成轴。绘图图元不归组，只借用已有的轴。
 */

/** 价格量纲组：价格序列与主图指标共用价格轴。 */
export const AXIS_GROUP_PRICE = 'price'

/**
 * Pane 没有任何对象可依附时，该 Pane 内的绘图共享这条轴。
 * 组内只有绘图时它才是绘图的标尺，因此绘图范围参与它的自动范围。
 */
export const AXIS_GROUP_DRAWING = 'drawing'

/**
 * 指标定义的量纲组：同一定义的实例数值语义相同，共用一条轴。
 *
 * @param indicatorId 指标定义身份
 * @returns 量纲组键
 */
export function indicatorAxisGroupKey(indicatorId: string): string {
  return `indicator:${indicatorId}`
}

/**
 * 量纲组在某个 Pane 内的轴身份。
 *
 * 轴是 Pane 的标尺：范围、变换和手动区间都按 axisId 存储，所以 Pane 参与身份，
 * 同一个组在不同 Pane 各有一条轴。
 *
 * @param paneId 轴所属 Pane
 * @param groupKey 量纲组键
 * @returns 轴身份
 */
export function axisGroupId(paneId: string, groupKey: string): string {
  return `axis:${paneId}:${groupKey}`
}
