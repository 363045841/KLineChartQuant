/**
 * 对象树契约：按 pane 分组的渲染对象只读视图与其命令面。
 *
 * 对象树不持有状态——分组成员来自 Scene 中的渲染对象，行字段是对象字段的投影，
 * 命令转发到对象自身的领域闭包。UI 与 Agent 都只依赖这里，不读各领域内部结构。
 */

import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type {
  RenderObjectCapabilities,
  RenderObjectCommands,
  RenderObjectKind,
  ScenePaintTarget,
} from '../../rendering/scene/types.js'

/**
 * 渲染对象契约的公开出口。
 *
 * 类型定义留在 Scene 层（`Layer` 依赖它们），这里与对象树一起重新导出，
 * 让消费方只从 `engine/objects` 取得同一组 API。
 */
export type {
  RenderObject,
  RenderObjectCapabilities,
  RenderObjectCommands,
  RenderObjectDescriptor,
  RenderObjectKind,
  RenderObjectMoveTarget,
} from '../../rendering/scene/types.js'

/**
 * 对象树中的一行：一个渲染对象在所属 pane 内的只读投影。
 *
 * 行不缓存状态：显隐、锁定、顺序变化后由分组信号重新发布。
 */
export interface PaneObjectRow {
  /** 稳定身份，等于 `Layer.id`；展示与命令都按它寻址。 */
  readonly objectId: string
  readonly kind: RenderObjectKind
  /** 显示名，由对象创建者按当前状态生成。 */
  readonly label: string
  readonly paneId: string
  /** 所属合成层带；行间排序先按层带，再按 `z`。 */
  readonly band: ScenePaintTarget
  /** 层带内顺序，越小越靠下。 */
  readonly z: number
  readonly visible: boolean
  readonly locked: boolean
  /** 由对象声明，UI 据此禁用操作，不按 kind 推断。 */
  readonly capabilities: RenderObjectCapabilities
}

/**
 * 一个 pane 的对象分组。
 *
 * `rows` 已按显示顺序排列：层带自下而上、层带内 `z` 自大而小，
 * 因此列表首行就是视觉最上层，UI 不再二次排序。
 */
export interface PaneObjectGroup {
  readonly paneId: string
  /** 分割线标题：取主序列或首个指标的对象名，内容为空时为 null；不代表 pane 身份。 */
  readonly title: string | null
  readonly rows: ReadonlyArray<PaneObjectRow>
}

/**
 * 图表对象树：只读分组信号 + 按身份取到的命令面。
 *
 * 命令契约只有一份（`RenderObjectCommands`），这里只负责按 id 找到它，
 * 不再重复声明同名方法。
 */
export interface ObjectTree {
  /** 按 pane 顺序分组的对象；pane 或任一对象状态变化后产生新引用。 */
  readonly groups: ReadonlySignal<ReadonlyArray<PaneObjectGroup>>

  /**
   * 按身份取对象命令；对象不存在时返回 null。
   *
   * 返回值随对象重建而失效，当次操作内使用即可，调用方不要缓存。
   */
  commandsFor(objectId: string): RenderObjectCommands | null
}
