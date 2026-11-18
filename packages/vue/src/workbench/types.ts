/** 完整工作台的公开配置；功能开关在挂载时确定。 */
import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime/contracts'
// 工具登记契约随 @Tool 注册表移到 /agent-tools 子入口，controllers 不再重导出。
import type { RegisteredChartTool } from '@363045841yyt/klinechart-core/agent-tools'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { KLinePeriod, MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import type KlineChart from '../components/chart/KLineChart.vue'

/** 工作台侧栏面板标识；与 SidePanelShell 的 `panel-<id>` 插槽一一对应。 */
export type KlineWorkbenchPanelId = 'agent' | 'orderflow' | 'options' | 'watchlist' | 'object-tree'

export interface KlineWorkbenchProps {
  /** 默认启用 Agent；关闭后不创建浏览器 Agent 宿主。 */
  agent?: boolean
  /** 默认加载内置脚本指标；关闭后不创建脚本执行 Worker。 */
  scripts?: boolean
  /** 智能体面板初始是否展开，默认收起；被 `initialPanel` 取代，保留以兼容旧调用方。 */
  initialAgentPanelOpen?: boolean
  /** 首次挂载展开的侧栏面板；省略时沿用 `initialAgentPanelOpen`。 */
  initialPanel?: KlineWorkbenchPanelId
  /** 行情实例归调用方所有，工作台卸载时不会销毁它。 */
  marketDataContext?: MarketDataContext
  /**
   * 宿主注入的 Agent 凭据存储；桌面端用它换成 OS 安全存储，
   * 省略时保持 Web 端默认实现，工作台本身不选择存储介质。
   */
  credentials?: ProviderCredentialStore
  /**
   * 宿主追加的图表工具惰性源，用于插件或宿主向 Agent 注入自有能力；
   * 未提供时不追加，工具在挂载时求值一次。
   */
  extraChartTools?: () => ReadonlyArray<RegisteredChartTool>
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
  /** 后补注册外部图表工具；宿主的工具晚于挂载就绪时用它补入目录。 */
  registerChartTools(tools: ReadonlyArray<RegisteredChartTool>): void
}
