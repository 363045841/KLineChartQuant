// 将桥接层抛出的 unknown 错误统一投影为界面可直接展示的 AgentErrorView。
import type { AgentErrorView } from './agent-contracts.js'

/**
 * 把 bridge 或运行时抛出的 unknown 错误收敛为错误视图。
 *
 * @param error 捕获到的错误；命中运行时错误形状时原样投影字段。
 * @param fallback 无法识别错误形状时使用的兜底视图。
 * @returns 带 code、message、retryable 等字段的展示契约。
 */
export function toAgentErrorView(error: unknown, fallback: AgentErrorView): AgentErrorView {
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
  }
  return fallback
}
