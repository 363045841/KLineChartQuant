/** 完整工作台的公开配置；功能开关在挂载时确定。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import type KlineChart from '../components/chart/KLineChart.vue'

export interface KlineWorkbenchProps {
  /** 默认启用 Agent；关闭后不创建浏览器 Agent 宿主。 */
  agent?: boolean
  /** 默认加载内置脚本指标；关闭后不创建脚本执行 Worker。 */
  scripts?: boolean
  initialAgentPanelOpen?: boolean
  /** 行情实例归调用方所有，工作台卸载时不会销毁它。 */
  marketDataContext?: MarketDataContext
  chart?: Omit<InstanceType<typeof KlineChart>['$props'], 'marketDataContext' | 'scriptsEnabled'>
}

export interface KlineWorkbenchHandle {
  getController(): ChartController | null
}
