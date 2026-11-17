// 未安装 Provider 适配器时的占位能力，保证应用服务在无网络实现时仍可启动。
import { AgentRuntimeError } from '../contracts/errors.js'
import type { AgentRunPlan } from '../pi/types.js'
import type { ProviderApi, RunPlanInput } from './types.js'

export interface RuntimeSupport {
  provider: ProviderApi
  createPlan(input: RunPlanInput): Promise<AgentRunPlan> | AgentRunPlan
}

export function createUnavailableRuntimeSupport(): RuntimeSupport {
  return {
    provider: {
      getStatus: () => ({
        state: 'not-configured',
        providerLabel: 'OpenAI-compatible',
        configured: false,
        compatibility: 'unknown',
      }),
      listModels: async () => {
        throw new AgentRuntimeError(
          'PROVIDER_NOT_CONFIGURED',
          'The production Provider adapter is not installed yet.',
        )
      },
      deleteCredential: async () => undefined,
    },
    createPlan: () => {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'The production Provider adapter is not installed yet.',
      )
    },
  }
}
