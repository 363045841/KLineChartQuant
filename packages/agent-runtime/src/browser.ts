// 页面侧 Agent 入口：宿主客户端、传输契约与协议；不引入宿主实现或持久化。
export {
  type AgentHostClient,
  type AgentHostClientOptions,
  createAgentHostClient,
} from './browser/client.js'
export type {
  AgentChartToolExecution,
  AgentClientToolHost,
  AgentHostTransport,
  AgentToolMetadata,
} from './browser/types.js'
export { AgentRuntimeError } from './contracts/errors.js'
export * from './host/protocol.js'
