// 浏览器宿主图表上下文的契约层：定义上下文来源及其宿主依赖，实现位于 impl/。

import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type { AgentContextItem } from '../../agent-contracts.js'

/** 图表上下文来源解析 ChartAgentController 所需的最小宿主依赖。 */
export interface ChartContextSourceDependencies {
  /** 返回当前可用的 ChartAgentController；图表尚未挂载时返回空。 */
  readonly getChartAgent: () => ChartAgentController | null | undefined
}

/** 图表上下文来源：绑定 Core controller 并向订阅者发布投影后的上下文项。 */
export interface ChartContextSource {
  /** 返回当前 Core 快照投影出的上下文项。 */
  getItems(): ReadonlyArray<AgentContextItem>
  /** 订阅上下文变化，订阅时立即发布一次当前值；返回取消订阅函数。 */
  subscribe(listener: (items: ReadonlyArray<AgentContextItem>) => void): () => void
  /** 绑定图表 controller，替换残留订阅并在绑定后立即发布。 */
  bind(agent: ChartAgentController | null | undefined): void
}
