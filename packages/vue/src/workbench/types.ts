/** 完整工作台的公开配置；功能开关在挂载时确定。 */
import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime/contracts'
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
   * 宿主注入的 Agent 凭据存储；桌面端用它换成 OS 安全存储，
   * 省略时保持 Web 端默认实现，工作台本身不选择存储介质。
   */
  credentials?: ProviderCredentialStore
  /** 来源 ID 与稳定品种 ID，周期独立控制。 */
  instrument?: { sourceId: string; id: string }
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
