/**
 * 对象树投影：把 Scene 中声明了业务身份的渲染对象，按 pane 分组成只读视图。
 *
 * 这里不持有任何对象状态——行字段读自渲染对象，分组顺序读自 pane 配置；
 * 命令按身份找回对象后调用其领域闭包。
 */

import { computed, type ReadonlySignal } from '../../../foundation/reactivity/signal.js'
import type { PaneSpec } from '../../pane/types.js'
import { MAIN_PANE_ID } from '../../pane/types.js'
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

/** 副图名称取该分组内第一个指标对象的显示名，主图固定为“主图”。 */
function resolvePaneLabel(spec: PaneSpec, rows: ReadonlyArray<PaneObjectRow>): string {
  if (spec.id === MAIN_PANE_ID) return '主图'
  return rows.find((row) => row.kind === 'indicator')?.label ?? '副图'
}

/**
 * 创建对象树。
 *
 * @param deps 渲染对象、pane 与指标实例信号
 * @returns 只读分组信号与按身份寻址的命令面
 */
export function createObjectTree(deps: ObjectTreeDependencies): ObjectTree {
  // 显隐、排序、锁定都来自渲染对象；对象状态变化会重建对象，从而重新发布分组。
  const groups = computed<ReadonlyArray<PaneObjectGroup>>(() => {
    const layers = deps.layers()
    return deps.paneSpecs().map((spec) => {
      const rows: PaneObjectRow[] = []
      for (const layer of layers) {
        if (layer.pane !== spec.id || layer.object === undefined) continue
        rows.push(toRow(layer, layer.object, spec.id))
      }
      // 列表自上而下即视觉上层到下层：先比层带，再比层带内的 z。
      rows.sort(
        (left, right) =>
          SCENE_TARGET_Z[right.band] - SCENE_TARGET_Z[left.band] || right.z - left.z,
      )
      return {
        paneId: spec.id,
        label: resolvePaneLabel(spec, rows),
        rows,
      }
    })
  })

  return {
    groups,
    commandsFor: (objectId) =>
      deps.layers.peek().find((layer) => layer.id === objectId)?.object?.commands ?? null,
  }
}
