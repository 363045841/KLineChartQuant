// 本文件将 Core 的精确品种查询能力注册为 Agent 只读工具。
import { Type, type Static } from 'typebox'

import { Tool, type ToolExecutionContext, type ToolImplementation } from './tool-registry.js'

/** 宿主向 Agent Runtime 注入的精确品种查询端口，隔离 Core 包依赖。 */
export interface InstrumentNameQueryToolPort {
  lookupInstrumentsBySymbol(input: {
    readonly symbol: string
    readonly sourceIds?: ReadonlyArray<string>
    readonly signal?: AbortSignal
  }): Promise<
    ReadonlyArray<{
      readonly symbol: string
      readonly name: string
      readonly sourceId: string
      readonly exchange: string
    }>
  >
}

export const InstrumentNameQueryParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  sourceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
})

type InstrumentNameQueryInput = Static<typeof InstrumentNameQueryParameters>

/** 按证券代码精确查询名称的 Agent 工具。 */
@Tool({
  name: 'instruments_query_name',
  label: 'Query instrument name',
  description:
    'Look up security names by an exact symbol through the active market-data sources. Optionally restrict the lookup to sourceIds. Return every exact match with its source and exchange; never infer a name from a partial match.',
  parameters: InstrumentNameQueryParameters,
  safety: 'read-only',
  executionMode: 'parallel',
})
export class InstrumentNameQueryTool implements ToolImplementation<typeof InstrumentNameQueryParameters> {
  /** 创建工具实例，并注入当前 Run 可用的宿主查询端口。 */
  constructor(private readonly port: InstrumentNameQueryToolPort) {}

  /** 生成 UI 可读的工具入参摘要。 */
  summarizeInput(input: InstrumentNameQueryInput): string {
    return `Query name for ${input.symbol}`
  }

  /** 调用 Core 精确查询能力，并将结构化匹配结果序列化为工具协议 JSON。 */
  async execute(
    input: InstrumentNameQueryInput,
    context: ToolExecutionContext,
  ): Promise<{ content: string; summary: string }> {
    context.signal.throwIfAborted()
    context.progress({ label: 'Looking up instrument name', current: 1, total: 1 })
    const matches = await this.port.lookupInstrumentsBySymbol({
      symbol: input.symbol,
      sourceIds: input.sourceIds,
      signal: context.signal,
    })
    context.signal.throwIfAborted()
    return {
      content: JSON.stringify({ matches }),
      summary: `Returned ${matches.length} exact instrument match${matches.length === 1 ? '' : 'es'}.`,
    }
  }
}
