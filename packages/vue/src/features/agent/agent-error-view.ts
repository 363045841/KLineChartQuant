// 将桥接层抛出的 unknown 错误投影为界面可直接展示的 AgentErrorView。

import type { AgentErrorView } from './agent-contracts.js'

/**
 * 把运行时或传输层抛出的 unknown 错误收敛为错误视图。
 *
 * 命中错误视图形状时原样投影字段；普通 Error 保留真实 message 并归为内部错误——
 * 不做领域归因，也不谎报成 Provider 失败，避免掩盖传输或序列化问题。
 *
 * @param error 捕获到的错误。
 * @returns 带 code、message、retryable 等字段的展示契约。
 */
export function toAgentErrorView(error: unknown): AgentErrorView {
  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>
    if (typeof value.code === 'string' && typeof value.message === 'string') {
      return {
        code: value.code,
        message: value.message,
        providerCode: typeof value.providerCode === 'string' ? value.providerCode : undefined,
        raw: typeof value.raw === 'string' ? value.raw : undefined,
        retryable: value.retryable === true,
        recommendedAction:
          typeof value.recommendedAction === 'string' ? value.recommendedAction : undefined,
      }
    }
    if (error instanceof Error)
      return { code: 'INTERNAL_ERROR', message: error.message, retryable: false }
  }
  return { code: 'INTERNAL_ERROR', message: 'The operation failed.', retryable: false }
}
