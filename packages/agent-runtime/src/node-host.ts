/**
 * Node 侧 Agent 宿主装配：设置落文件、会话落 SQLite。
 *
 * 浏览器宿主依赖 IndexedDB 与 MessagePort；这里换成文件与 SQLite，宿主本体、
 * 协议与全部业务逻辑仍与浏览器宿主共用同一份实现。
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'

import { AgentRuntimeError } from './contracts/errors.js'
import { AgentHost } from './host/impl/agent-host.js'
import { AgentSettingsStore } from './host/impl/agent-settings.js'
import type { AgentSettingsStorage } from './host/settings.js'
import type { AgentRuntimeSessions } from './host/types.js'
import { createNodeRuntimeSessions, type NodeRuntimeSessions } from './node.js'

/** 设置文档文件名；与会话数据库同放在宿主数据目录。 */
const SETTINGS_FILE = 'agent-settings.json'

/** 会话数据库文件名。 */
const SESSION_DATABASE = 'agent-sessions.sqlite'

/** 判断文件读取错误是否为「文件尚不存在」。 */
function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * 创建基于文件的设置文档存储。
 *
 * 写入先落临时文件再原子替换，进程中途退出不会留下半个 JSON；读取时文件缺失返回
 * `null`（宿主据此使用空文档），其它失败一律抛出，不做静默降级。
 *
 * @param filePath 设置文档的绝对路径
 * @returns 宿主使用的设置存储端口
 */
export function createFileAgentSettingsStorage(filePath: string): AgentSettingsStorage {
  return {
    async read(): Promise<unknown> {
      let text: string
      try {
        text = await readFile(filePath, 'utf8')
      } catch (error) {
        if (isMissingFile(error)) return null
        throw new AgentRuntimeError(
          'INTERNAL_ERROR',
          'The Agent settings file could not be read.',
          { cause: error },
        )
      }
      try {
        const parsed: unknown = JSON.parse(text)
        return parsed
      } catch (error) {
        throw new AgentRuntimeError(
          'INTERNAL_ERROR',
          'The Agent settings file is not valid JSON.',
          { cause: error },
        )
      }
    },
    async write(document: unknown): Promise<void> {
      const temporary = `${filePath}.tmp`
      await mkdir(dirname(filePath), { recursive: true })
      try {
        await writeFile(temporary, JSON.stringify(document), 'utf8')
        await rename(temporary, filePath)
      } catch (error) {
        // 原子写失败时清掉临时文件；清理本身失败不覆盖原始错误。
        await unlink(temporary).catch(() => undefined)
        throw new AgentRuntimeError(
          'INTERNAL_ERROR',
          'The Agent settings file could not be written.',
          { cause: error },
        )
      }
    },
  }
}

/** Node 宿主启动选项。 */
export interface NodeAgentHostOptions {
  /** 宿主数据目录；设置文件与会话数据库都放在这里。 */
  readonly dataDir: string
  /** 可替换的 fetch；桌面端注入 Electron 的 `net.fetch`。 */
  readonly fetch?: typeof globalThis.fetch
}

/** Node 宿主句柄。 */
export interface NodeAgentHost {
  /** 唯一的宿主实例。 */
  readonly host: AgentHost
  /** 关闭宿主并释放会话数据库。 */
  close(): Promise<void>
}

/**
 * 启动 Node 侧宿主。
 *
 * @param options 数据目录与可替换的 fetch
 * @returns 宿主句柄；调用方负责在退出前调用 `close()`
 */
export async function startNodeAgentHost(options: NodeAgentHostOptions): Promise<NodeAgentHost> {
  await mkdir(options.dataDir, { recursive: true })
  const settings = new AgentSettingsStore(
    createFileAgentSettingsStorage(join(options.dataDir, SETTINGS_FILE)),
  )
  const databasePath = join(options.dataDir, SESSION_DATABASE)
  let durable: NodeRuntimeSessions | undefined

  const host = new AgentHost({
    settings,
    createSessions: async (): Promise<AgentRuntimeSessions> => {
      const opened = await createNodeRuntimeSessions({ databasePath })
      durable = opened
      return {
        sessions: opened.sessions,
        close: () => opened.close(),
      }
    },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })

  return {
    host,
    async close() {
      await host.close()
      // 会话层关闭后数据库连接仍在，必须显式释放，否则文件句柄留在进程里。
      await durable?.storage.close(BACKGROUND_CONTEXT)
      durable = undefined
    },
  }
}
