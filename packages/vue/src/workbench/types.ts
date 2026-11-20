/** 完整工作台的公开配置；功能开关在挂载时确定。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { KLinePeriod, MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import type KlineChart from '../components/chart/KLineChart.vue'

export interface KlineWorkbenchProps {
  /** 默认启用 Agent；关闭后不创建浏览器 Agent 宿主。 */
  agent?: boolean
  /** 默认加载内置脚本指标；关闭后不创建脚本执行 Worker。 */
  scripts?: boolean
  /** 智能体面板初始是否展开，默认收起。 */
  initialAgentPanelOpen?: boolean
  /** 行情实例归调用方所有，工作台卸载时不会销毁它。 */
  marketDataContext?: MarketDataContext
  /**
   * 当前工作台是否为活动图表标签。
   *
   * 同一文档只存在一个 Agent 客户端，只有活动标签写入图表上下文；
   * 单工作台场景保持默认 `true`。
   */
  agentContextActive?: boolean
  /** 来源 ID 与稳定品种 ID，周期独立控制。 */
  instrument?: { source: string; id: string }
  period?: KLinePeriod
  /**
   * 挂载时是否恢复布局归档里的活动布局，默认 `true`。
   * 多标签通过 layoutStorageId 隔离归档，仍然启用恢复。
   */
  restoreLayout?: boolean
  /** 布局归档持有者的稳定身份。 */
  layoutStorageId?: string
  chart?: Omit<
    InstanceType<typeof KlineChart>['$props'],
    'marketDataContext' | 'scriptsEnabled' | 'symbols'
  >
}

export interface KlineWorkbenchHandle {
  getController(): ChartController | null
}
