// 浏览器 Agent bridge 的可注入依赖：存储装配、图表 controller 与凭据存储。

import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
import type { BrowserRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/browser'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'

/** 浏览器 Agent bridge 的构造选项；未注入时使用 Web 端默认实现。 */
export interface BrowserAgentBridgeOptions {
  /** 测试或嵌入方覆盖官方 Pi 存储；默认使用浏览器 IndexedDB。 */
  readonly createSessions?: () => Promise<BrowserRuntimeSessions>
  /** 返回当前可用的 ChartAgentController；图表尚未就绪时返回空。 */
  readonly getChartAgent?: () => ChartAgentController | null | undefined
  /**
   * 替换默认的 localStorage 凭据存储（Electron 侧注入 safeStorage 实现）。
   * 注意 apiKey 不写入 localStorage。
   */
  readonly credentials?: ProviderCredentialStore
}
