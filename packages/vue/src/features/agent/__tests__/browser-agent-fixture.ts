// 本文件为 Bridge 测试注入官方 Pi 内存存储，避免测试间共享浏览器数据库。
import { createMemoryRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/testing'
import { BrowserAgentBridge as ProductionBridge } from '../browser-agent/bridge/impl/browser-agent-bridge'
import type { BrowserAgentBridgeOptions } from '../browser-agent/bridge/types'

export class BrowserAgentBridge extends ProductionBridge {
  /** 只替换存储装配，其余 Bridge 行为全部使用生产实现。 */
  constructor(options: BrowserAgentBridgeOptions = {}) {
    super({ createSessions: createMemoryRuntimeSessions, ...options })
  }
}
