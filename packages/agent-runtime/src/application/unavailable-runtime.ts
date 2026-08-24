import { AgentRuntimeError } from '../contracts/errors.js'

import type { AgentApplicationServiceOptions } from './types.js'

export interface RuntimeSupport {
  provider: NonNullable<AgentApplicationServiceOptions['provider']>
  createPlan: AgentApplicationServiceOptions['createPlan']
}

export function createUnavailableRuntimeSupport(): RuntimeSupport {
  return {
    provider: {
      getStatus: () => ({
        state: 'not-configured',
        providerLabel: '302.ai',
        configured: false,
        baseUrl: 'https://api.302.ai/v1',
        compatibility: 'unknown',
      }),
      listModels: async () => {
        throw new AgentRuntimeError(
          'PROVIDER_NOT_CONFIGURED',
          'The production Provider adapter is not installed yet.',
        )
      },
      test: async () => {
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
