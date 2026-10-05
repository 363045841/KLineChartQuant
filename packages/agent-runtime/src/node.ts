// 本文件创建官方 pi-durable SQLite 存储及应用会话服务。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { SqliteStorage } from '@earendil-works/pi-durable/storage/sqlite'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { openDurableExecution } from './sessions/durable-execution.js'
import {
  RuntimeSessionService,
  type RuntimeSessionServiceOptions,
} from './sessions/runtime-session-service.js'

export interface NodeRuntimeSessionOptions {
  databasePath: string
  now?: RuntimeSessionServiceOptions['now']
  id?: RuntimeSessionServiceOptions['id']
  redaction?: RuntimeSessionServiceOptions['redaction']
}

export interface NodeRuntimeSessions {
  sessions: RuntimeSessionService
  storage: SqliteStorage
  close(): Promise<void>
}

/** 异步打开 SQLite；底层 Session 与存储随宿主一起关闭。 */
export async function createNodeRuntimeSessions(
  options: NodeRuntimeSessionOptions,
): Promise<NodeRuntimeSessions> {
  const storage = await openNodeSqliteStorage(options.databasePath)
  const execution = await openDurableExecution(storage)
  const session = execution.harness
  const sessions = new RuntimeSessionService({
    session,
    execution,
    now: options.now,
    id: options.id,
    redaction: options.redaction,
  })
  return { sessions, storage, close: () => session.close(BACKGROUND_CONTEXT) }
}
