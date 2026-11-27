/**
 * Agent 宿主的依赖端口与运行时会话契约。
 *
 * 宿主只依赖这些端口，不感知 Vue、图表或浏览器 UI；页面侧的能力经协议回路由。
 */

import type { AgentSessionService } from '../sessions/session-service.js'
import type { AgentSettings } from './settings.js'
import type {
  AgentClientRequest,
  AgentClientResponse,
  AgentHostToClientNotification,
} from './protocol.js'

/** 宿主持有的持久化会话服务；关闭时释放底层存储。 */
export interface AgentRuntimeSessions {
  sessions: AgentSessionService
  close(): Promise<void>
}

/** 宿主向一个已接入页面发送消息的出口。 */
export type AgentClientSender = (
  message: AgentClientRequest | AgentClientResponse | AgentHostToClientNotification,
) => void

/** 创建宿主所需的依赖。 */
export interface AgentHostOptions {
  /** 设置文档的唯一来源。 */
  readonly settings: AgentSettings
  /** 打开持久化会话服务；由宿主环境决定底层存储。 */
  readonly createSessions: () => Promise<AgentRuntimeSessions>
  /** 可替换的 fetch，测试与诊断用。 */
  readonly fetch?: typeof globalThis.fetch
  /** 请求标识生成器；默认使用 `crypto.randomUUID`。 */
  readonly createId?: () => string
}
