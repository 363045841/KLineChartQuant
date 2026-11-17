// 本文件为测试提供官方 MemoryStorage 装配，不伪造 Pi 的持久化行为。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { MemoryStorage } from '@earendil-works/pi-durable'
import type { BrowserRuntimeSessions } from '../browser.js'
import { openDurableExecution } from '../sessions/durable-execution.js'
import { AgentSessionService } from '../sessions/session-service.js'

/** 创建基于官方内存存储的应用会话服务。 */
export async function createMemoryRuntimeSessions(): Promise<BrowserRuntimeSessions> {
  const execution = await openDurableExecution(new MemoryStorage())
  const session = execution.harness
  return {
    sessions: new AgentSessionService({ execution }),
    close: () => session.close(BACKGROUND_CONTEXT),
  }
}
