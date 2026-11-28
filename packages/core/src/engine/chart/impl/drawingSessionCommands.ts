/**
 * 绘图会话命令：会话注册、悬停命中、拖拽冻结与撤销重做。
 *
 * 会话是绘图交互的短生命周期对象；这里持有它，宿主持有实例。
 */

import type { InteractionStateModule } from '../../state/interactionState.js'
import type { ChartDom } from '../types.js'
import type { DrawingCommands, DrawingInteractionController } from '../../drawing/index.js'

/** 绘图会话命令依赖。 */
export interface ChartDrawingSessionDeps {
  readonly interaction: InteractionStateModule
  readonly dom: ChartDom
  /** 命令面在装配后才可用，读取时再取。 */
  readonly commands: () => DrawingCommands
}

/** 绘图会话与悬停状态的唯一入口。 */
export class ChartDrawingSessionCommands {
  private session: DrawingInteractionController | null = null

  constructor(private readonly deps: ChartDrawingSessionDeps) {}

  /** 当前会话；未进入绘图时为空。 */
  get currentSession(): DrawingInteractionController | null {
    return this.session
  }

  /** 注册或注销会话；注册时立即应用当前工具语义。 */
  register(session: DrawingInteractionController | null): void {
    this.session = session
    session?.applyToolSession()
  }

  /** 按指针位置重算悬停命中；无会话时清空。 */
  updateHover(clientX: number, clientY: number): void {
    if (this.session === null) {
      this.clearHover()
      return
    }
    const hit = this.session.getHoveredHit({ clientX, clientY }, this.deps.dom.container)
    this.deps.interaction.actions.setDrawingHover(
      hit === null ? null : { target: hit.target.type, cursor: hit.cursor },
    )
  }

  /** 拖拽开始：冻结当前命中，期间不再被实时结果改写。 */
  freezeHover(): void {
    if (this.session === null) return
    this.deps.interaction.actions.setDrawingDragHover(
      this.deps.interaction.readonly.hoveredDrawing.peek(),
    )
  }

  /** 拖拽结束：恢复实时命中。 */
  unfreezeHover(): void {
    this.deps.interaction.actions.setDrawingDragHover(null)
  }

  /** 指针离开、悬停清空或切换工具时清空命中。 */
  clearHover(): void {
    this.deps.interaction.actions.setDrawingHover(null)
  }

  /** 取消进行中的绘制，不提交任何图元。 */
  cancel(): void {
    this.session?.cancelPendingChanges()
  }

  undo(): boolean {
    return this.deps.commands().history.undo()
  }

  redo(): boolean {
    return this.deps.commands().history.redo()
  }
}
