/**
 * 图表 Agent 客户端：把运行时的宿主客户端与页面侧图表上下文合成为 UI 使用的桥。
 *
 * UI 只看到 `AgentBridgeClient`；运行时的会话、模型与 Provider 全部在宿主侧，
 * 这里只补充图表上下文并在发起运行前冻结快照。
 */

import type { AgentHostClient } from '@363045841yyt/klinechart-agent-runtime/browser'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentRunContext,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  StartRunInput,
} from '../../../agent-contracts.js'
import { BrowserChartContextSource } from '../../chart-context/impl/browser-chart-context-source.js'
import { ChartToolHost } from './chart-tool-host.js'

/** UI 使用的完整桥：宿主客户端 + 图表上下文 + 图表工具绑定。 */
export interface ChartAgentClient extends AgentBridgeClient {
  /** 绑定当前图表的 Agent controller；未绑定图表时上下文为空。 */
  bindChartAgent(agent: ChartAgentController | null | undefined): void
  /** 把旧版 LocalStorage 设置一次性导入宿主存储。 */
  importLegacy(document: unknown): Promise<void>
}

/** 冻结一次运行的上下文快照；运行期间图表变化不影响已提交的计划。 */
function freezeContext(items: ReadonlyArray<AgentContextItem>): AgentRunContext {
  return Object.freeze({ items: Object.freeze([...items]) })
}

/**
 * 合成 UI 桥。
 * @param host 运行时提供的宿主客户端。
 * @param tools 图表工具端口。
 * @returns 供工作区直接消费的桥。
 */
export function createChartAgentClient(
  host: AgentHostClient,
  tools: ChartToolHost,
): ChartAgentClient {
  const context = new BrowserChartContextSource({ getChartAgent: () => tools.bound })

  /** 运行类调用统一补上当前上下文快照。 */
  function withContext<T extends { context?: AgentRunContext }>(
    input: T,
  ): T & { context: AgentRunContext } {
    return { ...input, context: freezeContext(context.getItems()) }
  }

  return {
    ...host,
    getContextItems: (): ReadonlyArray<AgentContextItem> => context.getItems(),
    subscribeContextItems: (listener) => context.subscribe(listener),
    bindChartAgent: (agent) => {
      tools.bind(agent)
      context.bind(agent)
    },
    startRun: (input: StartRunInput) => host.startRun(withContext(input)),
    retryRun: (input: BranchMessageInput) => host.retryRun(withContext(input)),
    continueRun: (input: ContinueRunInput) => host.continueRun(withContext(input)),
    editMessage: (input: EditMessageInput) => host.editMessage(withContext(input)),
  }
}
