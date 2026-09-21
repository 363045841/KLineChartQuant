/**
 * Agent 模型设置持久化测试共享夹具：统一从 LocalStorage 读取设置文档。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import { AGENT_MODEL_SETTINGS_STORAGE_KEY } from '../browser-agent-bridge'

/** 返回 LocalStorage 中持久化的 Agent 模型设置 JSON 原文；缺失时返回空串。 */
export function storedAgentModelSettingsJson(): string {
  return window.localStorage.getItem(AGENT_MODEL_SETTINGS_STORAGE_KEY) ?? ''
}

/** 解析 LocalStorage 中的 Agent 模型设置文档；缺失时返回 null。 */
export function readStoredAgentModelSettings(): unknown {
  const raw = window.localStorage.getItem(AGENT_MODEL_SETTINGS_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw)
}
