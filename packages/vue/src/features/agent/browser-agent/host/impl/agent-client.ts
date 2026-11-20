/**
 * 文档级 Agent 客户端单例。
 *
 * 一个 document 只有一个客户端：多个图表标签、多次面板开合都复用同一份连接，
 * 因此锁、会话与 Provider 在结构上就不会重复。测试可用工厂钩子替换。
 */

import {
  AgentRuntimeError,
  createAgentHostClient,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import { type ChartAgentClient, createChartAgentClient } from './chart-agent-client.js'
import { ChartToolHost } from './chart-tool-host.js'
import { connectSharedWorkerTransport } from './shared-worker-transport.js'

/** 旧版设置文档的键名；迁移后立即删除，不再有第二个读取源。 */
const LEGACY_SETTINGS_KEY = 'agent.model-settings'

/** 旧文档原样读取，交给宿主解析；这里不解释任何业务字段。 */
const legacyCodec: PersistenceCodec<unknown> = {
  decode(value): unknown {
    return value ?? null
  },
  encode(value): unknown {
    return value
  },
}

let client: ChartAgentClient | undefined

/** 取当前文档的 Agent 客户端；首次访问时建立连接并触发一次迁移。 */
export function getChartAgentClient(): ChartAgentClient {
  client ??= createDefaultClient()
  return client
}

/** 默认实现：SharedWorker 传输 + 图表工具端口 + 宿主客户端。 */
function createDefaultClient(): ChartAgentClient {
  const tools = new ChartToolHost()
  const host = createAgentHostClient({
    transport: connectSharedWorkerTransport(),
    toolHost: tools,
  })
  const result = createChartAgentClient(host, tools)
  void importLegacySettings(result)
  return result
}

/**
 * 把旧版 LocalStorage 设置导入宿主存储。
 *
 * `null` 表示本地没有旧设置；读取失败与导入失败都保留旧键并在下一次启动重试，
 * 同时输出错误，不做静默吞掉。
 */
async function importLegacySettings(target: ChartAgentClient): Promise<void> {
  const persistence = createLocalStoragePersistence<unknown>({
    key: LEGACY_SETTINGS_KEY,
    codec: legacyCodec,
    flushOnPageHide: false,
  })
  let legacy: unknown
  try {
    legacy = persistence.load()
  } catch (error) {
    console.error('[agent] Legacy settings could not be read.', error)
    return
  }
  if (legacy === null) return
  try {
    await target.importLegacy(legacy)
    persistence.clear()
  } catch (error) {
    if (error instanceof AgentRuntimeError && error.code === 'DUPLICATE_REQUEST') {
      persistence.clear()
      return
    }
    console.error('[agent] Legacy settings migration failed.', error)
  }
}
