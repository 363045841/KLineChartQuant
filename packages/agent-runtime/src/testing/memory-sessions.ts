// 本文件为测试提供官方 MemoryStorage 装配，不模拟 Pi 的持久化行为。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { MemoryStorage } from '@earendil-works/pi-durable'
import type { BrowserRuntimeSessions } from '../browser.js'
import { openDurableExecution } from '../sessions/durable-execution.js'
import {
  RuntimeSessionService,
  type RuntimeSessionServiceOptions,
} from '../sessions/runtime-session-service.js'

/** 创建独立的官方内存存储与应用会话服务。 */
export async function createMemoryRuntimeSessions(
  redaction?: RuntimeSessionServiceOptions['redaction'],
): Promise<BrowserRuntimeSessions> {
  const execution = await openDurableExecution(new MemoryStorage())
  const session = execution.harness
  return {
    sessions: new RuntimeSessionService({ session, execution, redaction }),
    close: () => session.close(BACKGROUND_CONTEXT),
  }
}
