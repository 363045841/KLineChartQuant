/**
 * toolbar 模块对外契约入口。
 *
 * 工具栏状态、工具定义与工厂初始化契约由此模块维护。
 */

import type { Signal } from '../../foundation/reactivity/index.js'

export type ToolId = string

export interface ToolDefinition {
  id: ToolId
  label: string
  icon?: string
  group?: string
  disabled?: boolean
}

export interface ToolbarController {
  readonly tools: Signal<ReadonlyArray<ToolDefinition>>
  readonly activeTool: Signal<ToolId | null>
  readonly disabledTools: Signal<ReadonlySet<ToolId>>
  selectTool(id: ToolId): void
  clearSelection(): void
  setDisabled(id: ToolId, disabled: boolean): void
  dispose(): void
}

/** createToolbarController 的初始化参数。 */
export interface ToolbarInit {
  tools: ReadonlyArray<ToolDefinition>
  initialActiveTool?: ToolId | null
}
