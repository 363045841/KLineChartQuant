// 本文件装配浏览器 IndexedDB 存储与官方 pi-durable 运行时。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { IndexedDbStorage } from '@earendil-works/pi-durable/storage/indexeddb'
import { AgentRuntimeError } from './contracts/errors.js'
import { openDurableExecution } from './sessions/durable-execution.js'
import {
  RuntimeSessionService,
  type RuntimeSessionServiceOptions,
} from './sessions/runtime-session-service.js'

// 旧版本用 JSONL 文件系统（库内只有 files 表）持有一个 IDB v1 数据库，官方存储的 schema 与之不兼容，
// 因此升级时换库名：旧库原样保留但不再读取，浏览器端历史会话不做自动迁移。
const BROWSER_SESSION_DATABASE = 'kq-agent-durable-v2'

export interface BrowserRuntimeSessionOptions {
  databaseName?: string
  redaction?: RuntimeSessionServiceOptions['redaction']
}

export interface BrowserRuntimeSessions {
  sessions: RuntimeSessionService
  close(): Promise<void>
}

/** 获取独占写锁，保证同一数据库同时只有一个标签页持有官方存储。 */
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

/** 打开浏览器持久化会话；不支持的环境直接报告错误。 */
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
    const sessions = new RuntimeSessionService({ session, execution, redaction: options.redaction })
    return {
      sessions,
      // Session 关闭时会一并关闭它持有的 Storage，这里只释放跨标签页锁。
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
