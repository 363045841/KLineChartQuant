// 本文件装配浏览器 IndexedDB 文件系统与官方 pi-durable JSONL 存储。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createSession } from '@earendil-works/pi-durable'
import { JsonlStorage } from '@earendil-works/pi-durable/storage/jsonl'
import { IndexedDbFileSystem } from './sessions/indexeddb-filesystem.js'
import {
  RuntimeSessionService,
  type RuntimeSessionServiceOptions,
} from './sessions/runtime-session-service.js'

const BROWSER_SESSION_DATABASE = 'kq-agent-durable-v1'
const BROWSER_SESSION_DIRECTORY = '/sessions'

export interface BrowserRuntimeSessionOptions {
  databaseName?: string
  redaction?: RuntimeSessionServiceOptions['redaction']
}

export interface BrowserRuntimeSessions {
  sessions: RuntimeSessionService
  close(): Promise<void>
}

/** 获取独占写锁，防止两个页面持有各自的 JSONL 内存索引。 */
async function lockDatabase(name: string): Promise<() => Promise<void>> {
  if (!navigator.locks) throw new Error('Browser session persistence requires Web Locks.')
  return new Promise((resolve, reject) => {
    const lifetime = navigator.locks.request(
      name,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          reject(new Error('Agent sessions are open in another page.'))
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
  let fs: IndexedDbFileSystem | undefined
  try {
    fs = await IndexedDbFileSystem.open(name)
    const storage = await JsonlStorage.open(BROWSER_SESSION_DIRECTORY, fs, BACKGROUND_CONTEXT)
    const session = createSession(storage)
    const sessions = new RuntimeSessionService({ session, redaction: options.redaction })
    const filesystem = fs
    return {
      sessions,
      async close() {
        try {
          await session.close(BACKGROUND_CONTEXT)
        } finally {
          await filesystem.cleanup()
          await release()
        }
      },
    }
  } catch (error) {
    await fs?.cleanup()
    await release()
    throw error
  }
}
