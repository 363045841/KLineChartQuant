/** Agent 工具契约：工具定义是纯数据，name / description / schema / effect 一起构成对外承诺。 */
import type { TSchema } from 'typebox'

import type { ChartToolEffect, ChartToolExecutionContext } from '../../../foundation/agent/index.js'

/** 工具返回给模型的结果；content 进入上下文，summary 供 UI 展示。 */
export interface ChartToolResult {
  readonly content: string
  readonly summary: string
}

/** 供工具列表与设置界面使用的静态元数据。 */
export interface ChartToolMetadata {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly effect: ChartToolEffect
}

/** 一只可执行工具：契约与实现同处一份声明。 */
export interface ChartToolDefinition<TParameters extends TSchema = TSchema>
  extends ChartToolMetadata {
  readonly parameters: TParameters
  readonly summarizeInput?: (input: unknown) => string
  execute(input: unknown, context: ChartToolExecutionContext): Promise<ChartToolResult>
}
