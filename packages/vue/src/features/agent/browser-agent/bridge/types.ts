// 浏览器 Agent bridge 模块的契约层：定义 bridge 装配所需的宿主依赖；实现位于 impl/。

import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'

/** 浏览器 Agent bridge 的宿主依赖；未注入时使用 Web 端默认实现。 */
export interface BrowserAgentBridgeOptions {
  /** 返回当前可用的 ChartAgentController；图表尚未挂载时返回空。 */
  readonly getChartAgent?: () => ChartAgentController | null | undefined
  /**
   * 替换默认的 localStorage 凭据存储。Electron 宿主注入 safeStorage 实现；
   * 不传时行为与 Web 端完全一致。注入后 apiKey 不再写入 localStorage。
   */
  readonly credentials?: ProviderCredentialStore
}
