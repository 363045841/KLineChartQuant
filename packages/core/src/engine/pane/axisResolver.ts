/**
 * 指标轴解析器：由定义能力与 Pane 内实例顺序派生轴列表与实例绑轴。
 *
 * 轴不是持久化状态，也没有公开写命令；`shared` 只并入同类型轴，
 * 类型不匹配时自动退回独立轴，避免振荡指标与价格共用一条轴。
 */
import type {
  IndicatorAxisBinding,
  IndicatorAxisKind,
  IndicatorMetadata,
} from '../indicators/indicatorMetadata.js'
import type { IndicatorInstanceSpec } from '../state/indicatorState.js'
import { MAIN_PANE_ID } from './types.js'

/** 一个 Pane 内的轴；顺序即右侧轴列顺序。 */
export interface PaneAxisSpec {
  readonly axisId: string
  readonly paneId: string
  readonly kind: IndicatorAxisKind
  readonly shared: boolean
  readonly instanceIds: ReadonlyArray<string>
}

/** 实例 → 轴的唯一映射；渲染、刻度、范围都从这里读取。 */
export type InstanceAxisMap = ReadonlyMap<string, string>

/** 定义未声明时按分类推导轴类型。 */
export function resolveAxisKind(definition: IndicatorMetadata): IndicatorAxisKind {
  if (definition.axisKind) return definition.axisKind
  return definition.category === 'main' ? 'price' : 'value'
}

/** 定义未声明时按分类推导默认绑定。 */
export function resolveAxisBinding(definition: IndicatorMetadata): IndicatorAxisBinding {
  if (definition.defaultAxis) return definition.defaultAxis
  return definition.category === 'main' ? 'shared' : 'own'
}

/** 共享轴身份：Pane 的首条共享轴沿用 paneId，后续按类型区分。 */
function sharedAxisId(
  paneId: string,
  kind: IndicatorAxisKind,
  axes: ReadonlyArray<PaneAxisSpec>,
): string {
  return axes.length === 0 ? paneId : `${paneId}:${kind}`
}

/**
 * 解析全部 Pane 的轴列表。
 *
 * @param paneIds 当前工作区的 Pane 顺序
 * @param instances 当前工作区的全部实例
 * @param getDefinition 已注册定义查询
 * @returns 每个 Pane 的轴列表；空 Pane 也保留一条默认轴
 */
export function resolvePaneAxes(
  paneIds: ReadonlyArray<string>,
  instances: ReadonlyArray<IndicatorInstanceSpec>,
  getDefinition: (indicatorId: string) => IndicatorMetadata | undefined,
): ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> {
  const result = new Map<string, ReadonlyArray<PaneAxisSpec>>()
  for (const paneId of paneIds) {
    const axes: PaneAxisSpec[] = []
    // 主图先有价格轴，即使当前没有共享价格的指标，K 线也需要它。
    if (paneId === MAIN_PANE_ID) {
      axes.push({
        axisId: paneId,
        paneId,
        kind: 'price',
        shared: true,
        instanceIds: [],
      })
    }
    const ordered = instances
      .filter((instance) => instance.paneId === paneId)
      .sort((left, right) => left.ordinal - right.ordinal)
    for (const instance of ordered) {
      const definition = getDefinition(instance.indicatorId)
      if (!definition) continue
      const kind = resolveAxisKind(definition)
      const binding = resolveAxisBinding(definition)
      const axisId =
        binding === 'own'
          ? axes.length === 0
            ? paneId
            : `instance:${instance.instanceId}`
          : (axes.find((axis) => axis.shared && axis.kind === kind)?.axisId ??
            sharedAxisId(paneId, kind, axes))
      const existing = axes.find((axis) => axis.axisId === axisId)
      if (existing) {
        axes[axes.indexOf(existing)] = {
          ...existing,
          instanceIds: [...existing.instanceIds, instance.instanceId],
        }
        continue
      }
      axes.push({
        axisId,
        paneId,
        kind,
        shared: binding === 'shared',
        instanceIds: [instance.instanceId],
      })
    }
    // 空 Pane 仍需要一条可投影的轴，避免运行时无轴可用。
    if (axes.length === 0) {
      axes.push({ axisId: paneId, paneId, kind: 'value', shared: true, instanceIds: [] })
    }
    result.set(paneId, Object.freeze(axes.map((axis) => Object.freeze(axis))))
  }
  return result
}

/** 由轴列表生成实例 → 轴映射。 */
export function resolveInstanceAxisMap(
  axesByPane: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>>,
): InstanceAxisMap {
  const map = new Map<string, string>()
  for (const axes of axesByPane.values()) {
    for (const axis of axes) {
      for (const instanceId of axis.instanceIds) map.set(instanceId, axis.axisId)
    }
  }
  return map
}

/** 某个 Pane 的主轴：轴列的第一条，兼容旧 PaneInfo.yAxis 语义。 */
export function resolvePrimaryAxis(
  axes: ReadonlyArray<PaneAxisSpec> | undefined,
  paneId: string,
): string {
  return axes?.[0]?.axisId ?? paneId
}
