/** Plan 模式的执行期 gate：工具表在会话内固定，写工具到执行时才被拒绝。 */
import type { AgentErrorView, AgentRunMode } from '../../contracts/ui.js'
import type { RuntimeToolDefinition } from '../../pi/types.js'
import { toolFailureResult } from '../../tools/failure.js'

/** Plan 模式拒绝写调用时返回的机器可读错误码。 */
export const PLAN_MODE_READ_ONLY = 'PLAN_MODE_READ_ONLY'

/** 写工具在 plan 模式下返回的失败信封；模型据此切回 build 再重试。 */
function planModeFailure(): AgentErrorView {
  return {
    code: PLAN_MODE_READ_ONLY,
    message: 'Plan mode is read-only; no changes were applied.',
    retryable: false,
    recommendedAction: 'Switch to Build mode, then retry this call.',
  }
}

/**
 * 给写工具包上 plan 模式 gate。
 *
 * 名称、描述、参数与 effect 都保持不变，模型仍然能看到写工具；只有执行被替换。
 * gate 在宿主侧完成，页面执行器不会收到这次调用。
 *
 * @param definition 原始工具定义。
 * @param mode 本次运行的权限模式。
 * @returns 可直接交给 Pi 的工具定义；read 工具与 build 模式返回原对象。
 */
export function withModeGate(
  definition: RuntimeToolDefinition,
  mode: AgentRunMode,
): RuntimeToolDefinition {
  if (mode === 'build' || definition.effect === 'read') return definition
  return {
    ...definition,
    async execute(_input, context) {
      context.signal.throwIfAborted()
      return toolFailureResult(planModeFailure())
    },
  }
}
