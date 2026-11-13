/**
 * 用户绘图的对象层同步：把当前作用域内的已确认图元投影成 Scene 中的渲染对象。
 *
 * 只维护图层成员与运行时字段；顺序、显隐、锁定的真实状态仍在绘图文档里，
 * 命令一律通过 DrawingCommands 写回。
 */

import type { RenderObject, RenderObjectDescriptor } from '@/rendering/scene/types.js'
import type { RenderContext } from '../../../../foundation/plugin/index.js'
import { createSignal, type ReadonlySignal } from '../../../../foundation/reactivity/signal.js'
import type { DrawingCommands } from '../../model/impl/DrawingCommands.js'
import { resolveDrawingLabel } from '../../model/impl/drawingKindSpecs.js'
import { filterDrawingsInScope } from '../../model/impl/drawingScope.js'
import type { DrawingScope } from '../../model/types.js'
import type { DrawingObject } from '../../types.js'
import { createDrawingObjectLayer } from './plugin.js'

/** 绘图对象层同步依赖。 */
export interface DrawingObjectLayerDependencies {
  readonly drawings$: ReadonlySignal<ReadonlyArray<DrawingObject>>
  /** 当前作用域（工作区、标的、周期）；与帧投影使用同一口径。 */
  getScope(): DrawingScope
  useRenderer(layer: RenderObject<RenderContext>): void
  removeRenderer(id: string): void
  readonly commands: DrawingCommands
  /** Pane 已被删除时不再为图元保留对象层。 */
  hasPane(paneId: string): boolean
}

/** 已挂载对象层与创建时的标签，用于判断是否需要重建描述符。 */
interface MountedDrawingObject {
  readonly layer: RenderObject<RenderContext>
  readonly label: string
}

/**
 * 创建绘图对象层同步器。
 *
 * @param deps 绘图文档、作用域与渲染挂载端口
 * @returns 手动同步入口与销毁函数
 */
export function createDrawingObjectLayers(deps: DrawingObjectLayerDependencies) {
  const mounted = new Map<string, MountedDrawingObject>()
  // 对象字段是原地修改，完成同步后递增版本，供对象树重读当前字段。
  const revision = createSignal(0)

  /** 用户图元的对象描述符；能力固定，命令闭包到所属图元。 */
  function descriptorFor(drawing: DrawingObject): RenderObjectDescriptor {
    return {
      kind: 'drawing',
      label: resolveDrawingLabel(drawing),
      capabilities: {
        removable: true,
        hideable: true,
        orderable: true,
        // 跨 Pane 会改变价格轴语义，绘图只能在所属 Pane 内排序。
        movable: false,
        lockable: true,
      },
      commands: {
        setVisible: (visible) => deps.commands.updateBatch([drawing.id], { visible }).length > 0,
        setLocked: (locked) => deps.commands.updateBatch([drawing.id], { locked }).length > 0,
        move: (target) =>
          target.kind === 'pane' &&
          target.paneId === drawing.paneId &&
          deps.commands.moveToIndex(drawing.id, target.index),
        remove: () => deps.commands.remove(drawing.id),
      },
    }
  }

  /** 把当前作用域内的用户图元同步为对象层；结构未变的层只更新运行时字段。 */
  function sync(): void {
    const scope = deps.getScope()
    const current = filterDrawingsInScope(deps.drawings$.peek(), scope).filter(
      (drawing) => drawing.ownerId === undefined && deps.hasPane(drawing.paneId),
    )
    const seen = new Set<string>()
    for (const drawing of current) {
      seen.add(drawing.id)
      const label = resolveDrawingLabel(drawing)
      const existing = mounted.get(drawing.id)
      if (existing && existing.label === label) {
        existing.layer.visible = drawing.visible
        existing.layer.locked = drawing.locked === true
        existing.layer.z = drawing.zIndex ?? existing.layer.z
        continue
      }
      if (existing) deps.removeRenderer(existing.layer.id)
      const layer = createDrawingObjectLayer(drawing.id, drawing.paneId, descriptorFor(drawing))
      layer.visible = drawing.visible
      layer.locked = drawing.locked === true
      layer.z = drawing.zIndex ?? layer.z
      deps.useRenderer(layer)
      mounted.set(drawing.id, { layer, label })
    }
    for (const [id, entry] of mounted) {
      if (seen.has(id)) continue
      deps.removeRenderer(entry.layer.id)
      mounted.delete(id)
    }
    revision.set(revision.peek() + 1)
  }

  const unsubscribe = deps.drawings$.subscribe(sync)
  sync()

  return {
    revision,
    sync,
    dispose(): void {
      unsubscribe()
      for (const entry of mounted.values()) deps.removeRenderer(entry.layer.id)
      mounted.clear()
    },
  }
}
