/**
 * 系统渲染对象管理：把图表自带对象（K 线等）注册为渲染对象并提供领域命令。
 *
 * 显隐、z 与所属 Pane 都存放在 SystemObjectState，随布局文档存档；
 * 图层可见性仍由 activeRenderers 投影统一写入，这里负责状态、z 与 Pane 归属。
 */

import { createSignal } from '../../../foundation/reactivity/signal.js'
import { RENDERER_PRIORITY } from '../../../foundation/plugin/impl/rendererConstants.js'
import type { Layer, RenderObjectDescriptor, RenderObjectMoveTarget } from '../../../rendering/scene/types.js'
import { scenePaintTarget } from '../../../rendering/scene/types.js'
import { createCandleLayer } from '../../renderers/candle.js'
import { CANDLE_LAYER_ID, CANDLE_RENDERER_NAME } from '../../renderers/rendererIds.js'
import { runInNewPane } from '../../pane/index.js'
import { MAIN_PANE_ID, type PanePlacement } from '../../pane/types.js'
import type { SystemObjectStateModule } from '../../state/systemObjectState.js'
import type { PaneObjectRow } from '../types.js'

/** 系统对象注册表：新增系统层时只补这里。 */
const SYSTEM_OBJECTS = {
  [CANDLE_RENDERER_NAME]: {
    layerId: CANDLE_LAYER_ID,
    defaultPaneId: MAIN_PANE_ID,
    defaultZ: RENDERER_PRIORITY.MAIN,
    createLayer: (paneId: string, object: RenderObjectDescriptor) =>
      createCandleLayer(paneId, object),
  },
} as const

/** 系统对象身份。 */
export type SystemObjectId = keyof typeof SYSTEM_OBJECTS

/** 系统对象身份列表；保留注册顺序，供按 id 遍历。 */
const SYSTEM_OBJECT_IDS = Object.keys(SYSTEM_OBJECTS) as ReadonlyArray<SystemObjectId>

/** 系统对象管理依赖。 */
export interface SystemObjectDependencies {
  readonly state: SystemObjectStateModule
  readonly getLayer: (layerId: string) => Layer | null
  readonly useRenderer: (layer: Layer) => void
  readonly removeRenderer: (layerId: string) => void
  /** 对象树当前行；用于把目标位置换算成层带内 z。 */
  readonly getRows: () => ReadonlyArray<PaneObjectRow>
  /** 系统对象的显示名；主序列使用当前品种代码，随品种切换更新。 */
  readonly getLabel: (objectId: SystemObjectId) => string
  /** 先建 Pane，再把系统对象移入。 */
  readonly addPane: (anchorPaneId: string, placement: PanePlacement) => string | null
  readonly paneExists: (paneId: string) => boolean
  readonly removePane: (paneId: string) => void
  /** 指标、绘图与其它系统对象是否仍占用该 Pane。 */
  readonly hasPaneObjects: (paneId: string) => boolean
  readonly requestDraw: () => void
}

/** 图层身份到对象身份的映射，供可见性投影查询用户隐藏。 */
function layerObjectId(layerId: string): SystemObjectId | null {
  for (const objectId of SYSTEM_OBJECT_IDS) {
    if (SYSTEM_OBJECTS[objectId].layerId === layerId) return objectId
  }
  return null
}

/**
 * 创建系统对象管理。
 *
 * @param deps 状态、图层查询、Pane 命令与对象树行来源
 * @returns 描述符工厂、应用入口与销毁函数
 */
export function createSystemObjects(deps: SystemObjectDependencies) {
  const state = deps.state.readonly.state
  // z 是原地字段；应用完成后递增版本，供对象树重读。
  const revision = createSignal(0)

  /** 当前对象所属 Pane：状态覆盖优先，否则使用注册表默认值。 */
  function paneIdOf(objectId: SystemObjectId): string {
    return state.peek().paneId[objectId] ?? SYSTEM_OBJECTS[objectId].defaultPaneId
  }

  /** 把 z 与 Pane 归属写回图层；Pane 变化时用相同 layer id 重新挂载。 */
  function apply(): void {
    const snapshot = state.peek()
    for (const objectId of SYSTEM_OBJECT_IDS) {
      const spec = SYSTEM_OBJECTS[objectId]
      const paneId = snapshot.paneId[objectId] ?? spec.defaultPaneId
      let layer = deps.getLayer(spec.layerId)
      if (layer && layer.pane !== paneId) {
        deps.removeRenderer(layer.id)
        layer = null
      }
      if (!layer) {
        const descriptor = descriptorFor(objectId)
        layer = spec.createLayer(paneId, descriptor)
        deps.useRenderer(layer)
      }
      layer.z = snapshot.z[objectId] ?? spec.defaultZ
    }
    revision.set(revision.peek() + 1)
  }

  /** 图层是否被用户隐藏；可见性投影与对象树共享同一判断。 */
  function isLayerHidden(layerId: string): boolean {
    const objectId = layerObjectId(layerId)
    return objectId !== null && state.peek().hidden.includes(objectId)
  }

  /** 目标 Pane 的层带内位置：取相邻两项的中点，首尾各外扩一格。 */
  function targetZ(
    objectId: SystemObjectId,
    targetPaneId: string,
    index: number | undefined,
  ): number | null {
    const spec = SYSTEM_OBJECTS[objectId]
    const layer = deps.getLayer(spec.layerId)
    const band = layer ? scenePaintTarget(layer.role) : 'main'
    const rows = deps
      .getRows()
      .filter(
        (row) =>
          row.paneId === targetPaneId && row.band === band && row.objectId !== spec.layerId,
      )
      .sort((left, right) => left.z - right.z)
    const at = index === undefined ? rows.length : Math.max(0, Math.min(index, rows.length))
    if (rows.length === 0) return spec.defaultZ
    const first = rows[0]
    const last = rows[rows.length - 1]
    if (!first || !last) return spec.defaultZ
    if (at <= 0) return first.z - 1
    if (at >= rows.length) return last.z + 1
    const below = rows[at - 1]
    const above = rows[at]
    if (!below || !above) return spec.defaultZ
    return (below.z + above.z) / 2
  }

  /**
   * 统一移动：已有 Pane 只改归属与 z；新建 Pane 时先建后移，失败由组合命令回收。
   */
  function moveObject(objectId: SystemObjectId, target: RenderObjectMoveTarget): boolean {
    /** 把对象写入目标 Pane；z 解析失败时不产生任何中间态。 */
    const applyToPane = (paneId: string, index?: number): boolean => {
      const z = targetZ(objectId, paneId, index)
      if (z === null) return false
      const previousPaneId = paneIdOf(objectId)
      const changedPane = previousPaneId !== paneId
      if (changedPane) deps.state.actions.setPane(objectId, paneId)
      deps.state.actions.setZ(objectId, z)
      // 移出后源 Pane 完全空了才回收；主图与仍有内容的副图保留。
      if (changedPane && previousPaneId !== MAIN_PANE_ID && !deps.hasPaneObjects(previousPaneId))
        deps.removePane(previousPaneId)
      deps.requestDraw()
      return true
    }
    if (target.kind === 'newPane')
      return runInNewPane(deps, target.anchorPaneId, target.placement, (paneId) =>
        applyToPane(paneId),
      )
    if (!deps.paneExists(target.paneId)) return false
    return applyToPane(target.paneId, target.index)
  }

  /** 系统对象的领域命令；删除与锁定不适用于图表自带对象。 */
  function descriptorFor(objectId: SystemObjectId): RenderObjectDescriptor {
    return {
      kind: 'system',
      get label() {
        return deps.getLabel(objectId)
      },
      capabilities: {
        removable: false,
        hideable: true,
        orderable: true,
        movable: true,
        lockable: false,
      },
      commands: {
        setVisible: (visible) => {
          deps.state.actions.setHidden(objectId, !visible)
          return true
        },
        setLocked: () => false,
        move: (target) => moveObject(objectId, target),
        remove: () => false,
      },
    }
  }

  const unsubscribe = state.subscribe(apply)
  return {
    descriptorFor,
    isLayerHidden,
    /** 系统对象当前所属 Pane；自动范围等消费者按内容读取。 */
    paneIdOf(objectId: SystemObjectId): string {
      return paneIdOf(objectId)
    },
    revision,
    apply,
    dispose(): void {
      unsubscribe()
    },
  }
}
