/** 工作区标签页的持久化契约；校验在 Core 的品种守卫里完成，适配层不重复实现。 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core'

export { isSymbolSpec } from '@363045841yyt/klinechart-core/controllers'

export interface WorkspaceTab {
  readonly id: string
  readonly spec: SymbolSpec | null
}
