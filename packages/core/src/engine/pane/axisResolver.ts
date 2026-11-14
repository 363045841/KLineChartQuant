/** 对象轴投影：每个对象独占一条稳定轴，不按定义类型或 Pane 身份合并。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneAxisSpec } from './axisTypes.js'

export type { PaneAxisSpec } from './axisTypes.js'
export type ObjectAxisMap = ReadonlyMap<string, string>

/** 从完整对象归属一次派生轴列表，非法容器在投影入口抛异常。 */
export function resolvePaneAxes(
  paneIds: ReadonlyArray<string>,
  objects: ReadonlyArray<PaneAxisSpec>,
): ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> {
  if (paneIds.length === 0 || new Set(paneIds).size !== paneIds.length)
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'Pane 列表必须非空且身份唯一')
  const result = new Map<string, PaneAxisSpec[]>(paneIds.map((id) => [id, []]))
  const objectIds = new Set<string>()
  const axisIds = new Set<string>()
  const append = (axis: PaneAxisSpec): void => {
    if (axis.objectId.length === 0 || axis.axisId.length === 0 || axis.paneId.length === 0)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '对象、Pane 和轴身份均不能为空')
    if (objectIds.has(axis.objectId) || axisIds.has(axis.axisId))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `重复的对象轴绑定：${axis.objectId} / ${axis.axisId}`,
      )
    const axes = result.get(axis.paneId)
    if (!axes)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `对象 ${axis.objectId} 绑定了不存在的 Pane ${axis.paneId}`,
      )
    axes.push(Object.freeze({ ...axis }))
    objectIds.add(axis.objectId)
    axisIds.add(axis.axisId)
  }
  for (const object of objects) append(object)
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
