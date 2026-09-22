/**
 * Agent 界面文案模块的公共入口：保持既有 `agent-copy` 导入路径可用，
 * 类型与实现已迁至 `agent-copy/`。
 */

export type { AgentCopy } from './agent-copy/impl/agent-copy.js'
export { getAgentCopy } from './agent-copy/impl/agent-copy.js'
export { AGENT_LOCALE_OPTIONS } from './agent-copy/impl/locale-options.js'
export type { AgentLocale, AgentLocaleOption } from './agent-copy/types.js'
