/**
 * 浏览器宿主的会话存储装配。
 *
 * 单写者由 SharedWorker 结构保证：一个 origin 只有一份宿主，因此这里不再需要
 * 任何跨标签页互斥锁，关闭页面也不会释放别人正在用的存储。
 */

import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { IndexedDbStorage } from '@earendil-works/pi-durable/storage/indexeddb'
import type { AgentRuntimeSessions } from '../../host/types.js'
import { openDurableExecution } from '../../sessions/durable-execution.js'
import { AgentSessionService } from '../../sessions/session-service.js'

/** 已发布的会话数据保存在该库中；新版本通过回填会话文档继续使用同一数据库。 */
export const BROWSER_SESSION_DATABASE = 'kq-agent-durable-v2'

/** 浏览器会话存储的创建选项。 */
export interface BrowserRuntimeSessionOptions {
  databaseName?: string
}

/**
 * 打开浏览器持久化会话服务。
 * @param options 可选数据库名，默认使用已发布库名。
 * @returns 会话服务与释放底层存储的关闭函数。
 */
export async function createBrowserRuntimeSessions(
  options: BrowserRuntimeSessionOptions = {},
): Promise<AgentRuntimeSessions> {
  const name = options.databaseName ?? BROWSER_SESSION_DATABASE
  const storage = await IndexedDbStorage.open(name)
  try {
    const execution = await openDurableExecution(storage)
    const session = execution.harness
    const sessions = new AgentSessionService({ execution })
    // 已发布版本的会话缺少新的标题文档，打开时回填一次。
    await sessions.adoptLegacySessions()
    return {
      sessions,
      async close() {
        try {
          await session.close(BACKGROUND_CONTEXT)
        } finally {
          await storage.close(BACKGROUND_CONTEXT)
        }
      },
    }
  } catch (error) {
    await storage.close(BACKGROUND_CONTEXT)
    throw error
  }
}
