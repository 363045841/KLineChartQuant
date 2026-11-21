/**
 * 浏览器宿主启动：装配设置存储与会话存储，然后在 SharedWorker 中接收页面连接。
 *
 * 宿主不检查运行环境的 SharedWorker 能力；页面侧负责在没有该能力时明确报错。
 */

import { AgentHost } from '../../host/impl/agent-host.js'
import { AgentSettingsStore } from '../../host/impl/agent-settings.js'
import { startAgentHostInSharedWorker } from './host-worker.js'
import { createIndexedDbSettingsStorage } from './indexeddb-settings-storage.js'
import { createBrowserRuntimeSessions } from './sessions.js'

/** 浏览器宿主的启动选项。 */
export interface BrowserAgentHostOptions {
  /** 设置文档数据库名，测试可替换。 */
  readonly settingsDatabaseName?: string
  /** 会话数据库名，测试可替换。 */
  readonly sessionDatabaseName?: string
  /** 可替换的 fetch。 */
  readonly fetch?: typeof globalThis.fetch
}

/**
 * 启动浏览器宿主。
 * @returns 正在运行的宿主实例。
 */
export function startBrowserAgentHost(options: BrowserAgentHostOptions = {}): AgentHost {
  const settings = new AgentSettingsStore(
    createIndexedDbSettingsStorage(options.settingsDatabaseName),
  )
  return startAgentHostInSharedWorker({
    settings,
    createSessions: () =>
      createBrowserRuntimeSessions(
        options.sessionDatabaseName === undefined
          ? {}
          : { databaseName: options.sessionDatabaseName },
      ),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })
}
