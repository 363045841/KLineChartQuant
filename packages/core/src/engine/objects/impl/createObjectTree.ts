/**
 * 对象树投影：把 Scene 中声明了业务身份的渲染对象，按 pane 分组成只读视图。
 *
 * 这里不持有任何对象状态——行字段读自渲染对象，分组顺序读自 pane 配置；
 * 命令按身份找回对象后调用其领域闭包。
 */

import { computed, type ReadonlySignal } from '../../../foundation/reactivity/signal.js'
import type { PaneSpec } from '../../pane/types.js'
import type { ObjectTree, PaneObjectGroup, PaneObjectRow } from '../types.js'
import {
  type Layer,
  type RenderObjectDescriptor,
  SCENE_TARGET_Z,
  scenePaintTarget,
} from '../../../rendering/scene/types.js'

/** 对象树投影依赖：只读取状态与渲染对象，不接收命令副本。 */
export interface ObjectTreeDependencies {
  /** Scene 的渲染对象列表；结构变化时产生新引用。 */
  readonly layers: ReadonlySignal<ReadonlyArray<Layer>>
  /** pane 顺序与身份。 */
  readonly paneSpecs: ReadonlySignal<ReadonlyArray<PaneSpec>>
  /**
   * 可变对象字段的变更通知。
   *
   * `z` / `visible` / `locked` 是原地修改的运行时字段，不产生信号；
   * 拥有这些对象的领域用自身状态信号通知对象树重新读取。
   */
  readonly revision?: ReadonlySignal<unknown>
}

/** 按 pane 顺序与层带顺序整理的一行；显示顺序在投影里一次确定。 */
function toRow(layer: Layer, descriptor: RenderObjectDescriptor, paneId: string): PaneObjectRow {
  return {
    objectId: layer.id,
    kind: descriptor.kind,
    label: descriptor.label,
    paneId,
    band: scenePaintTarget(layer.role),
    z: layer.z,
    visible: layer.visible,
    locked: layer.locked === true,
    capabilities: descriptor.capabilities,
  }
}

/**
 * 分割线标题由内容派生：主序列优先，其次首个指标，再退回首行；不读取 pane 身份。
 *
 * @param rows 已按展示顺序排列的行
 * @returns 标题；没有行时为 null
 */
function resolveGroupTitle(rows: ReadonlyArray<PaneObjectRow>): string | null {
  return (
    rows.find((row) => row.kind === 'system')?.label ??
    rows.find((row) => row.kind === 'indicator')?.label ??
    rows[0]?.label ??
    null
  )
}

/**
 * 创建对象树。
 *
 * @param deps 渲染对象与 pane 顺序信号
 * @returns 只读分组信号与按身份寻址的命令面
 */
export function createObjectTree(deps: ObjectTreeDependencies): ObjectTree {
  // 显隐、排序、锁定都来自渲染对象；对象状态变化会重建对象，从而重新发布分组。
  const groups = computed<ReadonlyArray<PaneObjectGroup>>(() => {
    deps.revision?.()
    const layers = deps.layers()
    return deps.paneSpecs().map((spec) => {
      const entries: Array<{ row: PaneObjectRow; order: number }> = []
      for (const [order, layer] of layers.entries()) {
        if (layer.pane !== spec.id || layer.object === undefined) continue
        entries.push({ row: toRow(layer, layer.object, spec.id), order })
      }
      // 列表自上而下即视觉上层到下层：先比层带，再比 z；同 z 时后注册的绘制在上。
      entries.sort(
        (left, right) =>
          SCENE_TARGET_Z[right.row.band] - SCENE_TARGET_Z[left.row.band] ||
          right.row.z - left.row.z ||
          right.order - left.order,
      )
      return {
        paneId: spec.id,
        title: resolveGroupTitle(entries.map((entry) => entry.row)),
        rows: entries.map((entry) => entry.row),
      }
    })
  })

  return {
    groups,
    commandsFor: (objectId) =>
      deps.layers.peek().find((layer) => layer.id === objectId)?.object?.commands ?? null,
  }
}
