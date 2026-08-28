import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import {
  createNodeSqliteFactory,
  SqliteSessionRepository,
} from '@earendil-works/pi-session-backend-sqlite-node'

import {
  RuntimeSessionService,
  type RuntimeSessionServiceOptions,
} from './sessions/runtime-session-service.js'

export interface NodeRuntimeSessionOptions {
  databasePath: string
  cwd: string
  now?: RuntimeSessionServiceOptions['now']
  id?: RuntimeSessionServiceOptions['id']
  redaction?: RuntimeSessionServiceOptions['redaction']
}

export interface NodeRuntimeSessions {
  sessions: RuntimeSessionService
  repository: SqliteSessionRepository
  close(): Promise<void>
}

export function createNodeRuntimeSessions(options: NodeRuntimeSessionOptions): NodeRuntimeSessions {
  const env = new NodeExecutionEnv({ cwd: options.cwd })
  const repository = new SqliteSessionRepository({
    env,
    sqlite: createNodeSqliteFactory(),
    databasePath: options.databasePath,
  })
  const sessions = new RuntimeSessionService({
    repository,
    createOptions: (id) => ({
      id,
      cwd: options.cwd,
      metadata: { kqSchemaVersion: 1 },
    }),
    now: options.now,
    id: options.id,
    redaction: options.redaction,
  })
  return {
    sessions,
    repository,
    async close() {
      await repository.close()
      await env.cleanup()
    },
  }
}
