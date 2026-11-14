/** 对象轴投影：同一量纲组的对象共用一条稳定轴，绘图绑定已有轴，不另立轴。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneAxisSpec } from './axisTypes.js'

export type { PaneAxisSpec } from './axisTypes.js'
export type ObjectAxisMap = ReadonlyMap<string, string>

/**
 * 从完整对象归属一次派生轴的绑定列表。
 *
 * 每条声明只回答"这个对象绑哪条轴"；同一条轴可挂多个对象（价格类、同定义指标、
 * 绘图），非法容器或跨 Pane 复用轴身份在投影入口抛异常。
 *
 * @param paneIds 当前工作区的 Pane 顺序
 * @param objects 全部对象轴声明，顺序即轴列顺序
 * @returns 每个 Pane 的对象轴声明
 */
export function resolvePaneAxes(
  paneIds: ReadonlyArray<string>,
  objects: ReadonlyArray<PaneAxisSpec>,
): ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> {
  if (paneIds.length === 0 || new Set(paneIds).size !== paneIds.length)
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'Pane 列表必须非空且身份唯一')
  const result = new Map<string, PaneAxisSpec[]>(paneIds.map((id) => [id, []]))
  const objectIds = new Set<string>()
  const axisPanes = new Map<string, string>()
  for (const axis of objects) {
    if (axis.objectId.length === 0 || axis.axisId.length === 0 || axis.paneId.length === 0)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '对象、Pane 和轴身份均不能为空')
    if (objectIds.has(axis.objectId))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `重复的对象轴绑定：${axis.objectId}`,
      )
    const axes = result.get(axis.paneId)
    if (!axes)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `对象 ${axis.objectId} 绑定了不存在的 Pane ${axis.paneId}`,
      )
    const owner = axisPanes.get(axis.axisId)
    if (owner !== undefined && owner !== axis.paneId)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `轴 ${axis.axisId} 不能跨 Pane：${owner} / ${axis.paneId}`,
      )
    axisPanes.set(axis.axisId, axis.paneId)
    objectIds.add(axis.objectId)
    axes.push(Object.freeze({ ...axis }))
  }
  return new Map([...result].map(([paneId, axes]) => [paneId, Object.freeze(axes)]))
}

/** 指标绑定从同一份轴投影读取，不在渲染入口重新猜测。 */
export function resolveObjectAxisMap(
  axesByPane: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>>,
): ObjectAxisMap {
  return new Map(
    [...axesByPane.values()].flatMap((axes) => axes.map((axis) => [axis.objectId, axis.axisId])),
  )
}
