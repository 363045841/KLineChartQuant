// 浏览器宿主的工具注册契约；实现位于 impl/，避免 Bridge 持有具体适配细节。

import type { AgentRunMode } from '@363045841yyt/klinechart-agent-runtime'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type { QuestionAnswerView } from '../../agent-contracts.js'

/** Runtime Tool Catalog 解析工具时需要的浏览器宿主状态。 */
export interface BrowserToolContext {
  readonly agent: ChartAgentController | null | undefined
  readonly mode: AgentRunMode
}

/** ask_user 工具回调所需的最小执行上下文。 */
export interface BrowserQuestionContext {
  readonly sessionId: string
  readonly runId: string
  readonly toolCallId: string
  readonly signal: AbortSignal
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
    context: BrowserQuestionContext,
  ) => Promise<QuestionAnswerView>
}
