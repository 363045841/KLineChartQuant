// 图表上下文来源实现：绑定 Core controller，并把 context 快照投影给订阅者。

import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type { AgentContextItem } from '../../../agent-contracts.js'
import type { ChartContextSource, ChartContextSourceDependencies } from '../types.js'
import { projectContextItems } from './project-context-items.js'

/** 浏览器宿主的图表上下文来源；支持 Agent 面板先于图表完成挂载。 */
export class BrowserChartContextSource implements ChartContextSource {
  private readonly listeners = new Set<(items: ReadonlyArray<AgentContextItem>) => void>()
  private chartAgent: ChartAgentController | null = null
  private unsubscribeSource: (() => void) | undefined

  constructor(private readonly dependencies: ChartContextSourceDependencies) {}

  getItems(): ReadonlyArray<AgentContextItem> {
    return projectContextItems(this.chartAgent ?? this.dependencies.getChartAgent())
  }

  subscribe(listener: (items: ReadonlyArray<AgentContextItem>) => void): () => void {
    this.bind(this.dependencies.getChartAgent())
    this.listeners.add(listener)
    listener(this.getItems())
    return () => this.listeners.delete(listener)
  }

  /** 绑定图表 controller；支持 Agent 面板先于图表完成挂载。 */
  bind(agent: ChartAgentController | null | undefined): void {
    const next = agent ?? null
    if (this.chartAgent === next) return
    this.unsubscribeSource?.()
    this.chartAgent = next
    this.unsubscribeSource = next?.context.subscribe(() => this.publish())
    this.publish()
  }

  /** 把当前上下文投影发布给所有订阅者。 */
  private publish(): void {
    const items = this.getItems()
    for (const listener of this.listeners) listener(items)
  }
}
