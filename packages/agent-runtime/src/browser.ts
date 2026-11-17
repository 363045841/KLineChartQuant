// 本文件装配浏览器端基于 IndexedDB 存储的官方 pi-durable 运行时。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { IndexedDbStorage } from '@earendil-works/pi-durable/storage/indexeddb'
import { AgentRuntimeError } from './contracts/errors.js'
import { openDurableExecution } from './sessions/durable-execution.js'
import { AgentSessionService } from './sessions/session-service.js'

// 已发布的会话数据保存在该库中；新版本通过回填会话文档继续使用同一数据库。
const BROWSER_SESSION_DATABASE = 'kq-agent-durable-v2'

export interface BrowserRuntimeSessionOptions {
  databaseName?: string
}

export interface BrowserRuntimeSessions {
  sessions: AgentSessionService
  close(): Promise<void>
}

/** 获取独占写锁，保证同一数据库同时只有一个标签页打开官方存储。 */
async function lockDatabase(name: string): Promise<() => Promise<void>> {
  if (!navigator.locks) {
    throw new AgentRuntimeError('INTERNAL_ERROR', 'Browser session persistence requires Web Locks.')
  }
  return new Promise((resolve, reject) => {
    const lifetime = navigator.locks.request(
      name,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          reject(
            new AgentRuntimeError('SESSION_LOCKED', 'Agent sessions are open in another page.', {
              retryable: true,
              recommendedAction: 'Close the other tab, then retry.',
            }),
          )
          return
        }
        await new Promise<void>((release) =>
          resolve(async () => {
            release()
            await lifetime
          }),
        )
      },
    )
    void lifetime.catch(reject)
  })
}

/** 创建浏览器端持久化会话服务，不支持的环境直接报错。 */
export async function createBrowserRuntimeSessions(
  options: BrowserRuntimeSessionOptions = {},
): Promise<BrowserRuntimeSessions> {
  const name = options.databaseName ?? BROWSER_SESSION_DATABASE
  const release = await lockDatabase(name)
  let storage: IndexedDbStorage | undefined
  try {
    storage = await IndexedDbStorage.open(name)
    const execution = await openDurableExecution(storage)
    const session = execution.harness
    const sessions = new AgentSessionService({ execution })
    // 已发布版本的会话缺少新的标题文档，打开时回填一次。
    await sessions.adoptLegacySessions()
    return {
      sessions,
      // Session 关闭时一并关闭存储层，并释放独占锁。
      async close() {
        try {
          await session.close(BACKGROUND_CONTEXT)
        } finally {
          await release()
        }
      },
    }
  } catch (error) {
    await storage?.close(BACKGROUND_CONTEXT)
    await release()
    throw error
  }
}
