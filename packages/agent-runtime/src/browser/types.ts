/**
 * 页面侧能力端口：图表工具目录与执行器由 Vue 层注入，运行时只按协议调用。
 */

import type { AgentRuntimeError } from '../contracts/errors.js'
import type { AgentClientMessage, AgentHostMessage, ChartToolDescriptor } from '../host/protocol.js'
import type { RuntimeToolResult, ToolEffect } from '../pi/types.js'

/** 图表工具的静态描述；未绑定图表时也用于工具设置界面。 */
export interface AgentToolMetadata {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly effect: ToolEffect
}

/** 一次图表工具执行的参数；与宿主发起的请求一一对应。 */
export interface AgentChartToolExecution {
  readonly toolName: string
  readonly input: unknown
  readonly sessionId: string
  readonly runId: string
  readonly toolCallId: string
  /** 宿主撤销调用时中止本地执行。 */
  readonly signal: AbortSignal
}

/** 页面提供的图表工具能力。 */
export interface AgentClientToolHost {
  /** 静态工具清单；不依赖图表实例。 */
  metadata(): readonly AgentToolMetadata[]
  /** 当前绑定图表声明的可执行工具；未绑定图表时为空。 */
  catalog(): readonly ChartToolDescriptor[]
  /** 在页面执行一次图表工具。 */
  execute(execution: AgentChartToolExecution): Promise<RuntimeToolResult>
}

/**
 * 页面与宿主之间的传输端口。
 *
 * 端口由客户端在构造时接管：订阅与错误挂接都是客户端自己的生命周期，
 * 创建方只负责创建连接，不承担维持连接的责任。
 */
export interface AgentHostTransport {
  /** 发送一条消息到宿主。 */
  post(message: AgentClientMessage): void
  /** 订阅宿主消息；返回取消订阅函数。 */
  subscribe(listener: (message: AgentHostMessage) => void): () => void
  /** 订阅传输层不可恢复的错误；调用方不需要再单独转发。 */
  onError(listener: (error: AgentRuntimeError) => void): () => void
}
