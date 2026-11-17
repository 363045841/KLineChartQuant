// 浏览器宿主的工具注册契约；实现位于 impl/，避免 Bridge 持有具体适配细节。

import type {
  AgentRunMode,
  AskUserExecutionContext,
  AskUserOutcome,
} from '@363045841yyt/klinechart-agent-runtime'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'

/** Runtime Tool Catalog 解析工具时需要的浏览器宿主状态。 */
export interface BrowserToolContext {
  readonly agent: ChartAgentController | null | undefined
  readonly mode: AgentRunMode
}

/** 工具注册器从 BrowserAgentBridge 获取的宿主能力。 */
export interface BrowserToolRegistryDependencies {
  readonly fetch: typeof globalThis.fetch
  readonly getWebSearchApiKey: () => string | undefined
  readonly requestQuestion: (
    request: {
      readonly prompt: string
      readonly options: readonly {
        readonly value: string
        readonly label: string
        readonly description?: string
      }[]
      readonly multiSelect: boolean
    },
    context: AskUserExecutionContext,
  ) => Promise<AskUserOutcome>
}
