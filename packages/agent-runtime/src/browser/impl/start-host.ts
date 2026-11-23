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
 * 浏览器网络失败的补充说明。
 *
 * `fetch` 对「网络不可达」和「跨域被拦」抛的是同一个 `TypeError`，无法区分，
 * 因此如实并列两种可能，并把桌面端作为不受该限制的替代路径指出来。
 */
const BROWSER_NETWORK_HINT =
  'The browser could not complete this request: the network may be unreachable, or the gateway may not allow requests from this origin (CORS). Use the desktop app, which is not subject to this limit: https://github.com/363045841/KLineChartQuant/releases/latest'

/**
 * 启动浏览器宿主。
 * @returns 正在运行的宿主实例。
 */
export function startBrowserAgentHost(options: BrowserAgentHostOptions = {}): AgentHost {
  const settings = new AgentSettingsStore(
    createIndexedDbSettingsStorage(options.settingsDatabaseName),
  )
  const implementation = options.fetch ?? globalThis.fetch.bind(globalThis)
  return startAgentHostInSharedWorker({
    settings,
    createSessions: () =>
      createBrowserRuntimeSessions(
        options.sessionDatabaseName === undefined
          ? {}
          : { databaseName: options.sessionDatabaseName },
      ),
    // 网络失败补上浏览器侧诊断；提示必须写进原始错误本身——Pi 只保留最深一层
    // cause 的 message，另包一层会被丢弃。中止信号原样抛出，不改变取消语义。
    fetch: async (input, init) => {
      try {
        return await implementation(input, init)
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          error.message = `${error.message} ${BROWSER_NETWORK_HINT}`
          throw error
        }
        throw error
      }
    },
  })
}
