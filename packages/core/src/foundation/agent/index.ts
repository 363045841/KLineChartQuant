/**
 * Agent 工具的基础契约：执行上下文、副作用分类与输入校验错误。
 *
 * 工具的注册与组合不在这里：领域能力由 `features/agent/tools` 以纯数据声明。
 */

/** 工具是否会改变宿主状态。 */
export type ChartToolEffect = 'read' | 'write'

/** Agent 调用工具时提供的非业务执行控制信息。 */
export interface ChartToolExecutionContext {
  readonly signal: AbortSignal
  progress(update: {
    readonly label: string
    readonly current?: number
    readonly total?: number
  }): void
}

export { ToolInputValidationError } from './errors.js'
