/** 对象轴投影：同一量纲组的对象共用一条稳定轴，绘图绑定已有轴，不另立轴。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { AxisSpec, ObjectAxisSpec, PaneAxisSpec } from './axisTypes.js'

export type { PaneAxisSpec } from './axisTypes.js'
export type ObjectAxisMap = ReadonlyMap<string, string>

/**
 * 按轴身份合并对象声明，保留量纲组首个对象的格式，组内任一对象可见即可显示轴。
 *
 * @param paneIds 当前工作区的 Pane 顺序
 * @param objects 全部对象轴声明，顺序即轴列顺序
 * @param standaloneAxes 没有数据对象的窗格提供的轴
 * @returns 每个 Pane 的轴，第一条为主右轴
 */
export function resolvePaneAxes(
  paneIds: ReadonlyArray<string>,
  objects: ReadonlyArray<ObjectAxisSpec>,
  standaloneAxes: ReadonlyArray<AxisSpec> = [],
): ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> {
  if (paneIds.length === 0 || new Set(paneIds).size !== paneIds.length)
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'Pane 列表必须非空且身份唯一')
  const result = new Map(paneIds.map((id) => [id, new Map<string, PaneAxisSpec>()]))
  const objectIds = new Set<string>()
  const axisPanes = new Map<string, string>()
  const add = (axis: AxisSpec, objectId?: string): void => {
    if (objectId === '' || axis.axisId.length === 0 || axis.paneId.length === 0)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '对象、Pane 和轴身份均不能为空')
    if (objectId !== undefined && objectIds.has(objectId))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `重复的对象轴绑定：${objectId}`,
      )
    const axes = result.get(axis.paneId)
    if (!axes)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `轴 ${axis.axisId} 绑定了不存在的 Pane ${axis.paneId}`,
      )
    const owner = axisPanes.get(axis.axisId)
    if (owner !== undefined && owner !== axis.paneId)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        `轴 ${axis.axisId} 不能跨 Pane：${owner} / ${axis.paneId}`,
      )
    axisPanes.set(axis.axisId, axis.paneId)
    const existing = axes.get(axis.axisId)
    if (objectId !== undefined) objectIds.add(objectId)
    const members = existing?.objectIds ?? []
    axes.set(axis.axisId, {
      ...(existing ?? axis),
      visible: (existing?.visible ?? false) || axis.visible,
      objectIds: objectId === undefined ? members : [...members, objectId],
    })
  }
  for (const { objectId, ...axis } of objects) add(axis, objectId)
  for (const axis of standaloneAxes) add(axis)
  return new Map(
    [...result].map(([paneId, axes]) => [
      paneId,
      Object.freeze([...axes.values()].map((axis) => Object.freeze(axis))),
    ]),
  )
}

/** 指标绑定从同一份轴投影读取，不在渲染入口重新猜测。 */
export function resolveObjectAxisMap(
  axesByPane: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>>,
): ObjectAxisMap {
  return new Map(
    [...axesByPane.values()].flatMap((axes) =>
      axes.flatMap((axis) => axis.objectIds.map((objectId) => [objectId, axis.axisId])),
    ),
  )
}
