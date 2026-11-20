/** 多语言文案模块的唯一入口：按语言取文案、语言选项与失败原因可见性。 */
export { getAgentCopy } from './impl/agent-copy.js'
export { AGENT_LOCALE_OPTIONS } from './impl/locale-options.js'
export type { AgentLocale, AgentLocaleOption, VisibleRunFailureReason } from './types.js'
