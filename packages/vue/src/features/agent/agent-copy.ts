/**
 * Agent 界面文案模块的公共入口：按语言取用 `agent-copy` 公共路径的调用方由此进入，
 * 具体实现已经迁入 `agent-copy/`。
 */

export { getAgentCopy } from './agent-copy/impl/agent-copy.js'
export { AGENT_LOCALE_OPTIONS } from './agent-copy/impl/locale-options.js'
export type { AgentLocale } from './agent-copy/types.js'
