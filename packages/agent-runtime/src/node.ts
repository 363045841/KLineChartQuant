// 本文件装配 Node 端官方 pi-durable SQLite 存储与应用会话服务。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { SqliteStorage } from '@earendil-works/pi-durable/storage/sqlite'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { openDurableExecution } from './sessions/durable-execution.js'
import { AgentSessionService } from './sessions/session-service.js'

export interface NodeRuntimeSessionOptions {
  databasePath: string
}

export interface NodeRuntimeSessions {
  sessions: AgentSessionService
  storage: SqliteStorage
  close(): Promise<void>
}

/** 异步打开 SQLite 与底层 Session，存储层由调用方一并关闭。 */
export async function createNodeRuntimeSessions(
  options: NodeRuntimeSessionOptions,
): Promise<NodeRuntimeSessions> {
  const storage = await openNodeSqliteStorage(options.databasePath)
  const execution = await openDurableExecution(storage)
  const session = execution.harness
  const sessions = new AgentSessionService({ execution })
  // 已发布版本的会话缺少新的标题文档，打开时回填一次。
  await sessions.adoptLegacySessions()
  return {
    sessions,
    storage,
    close: () => session.close(BACKGROUND_CONTEXT),
  }
}
