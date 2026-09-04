import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ToolCallCard from './ToolCallCard.vue'

import type { ToolCallView } from '../agent-contracts'

function tool(overrides: Partial<ToolCallView> = {}): ToolCallView {
  return {
    id: 'tool-1',
    runId: 'run-1',
    name: 'indicators_query',
    label: 'Query indicator',
    status: 'failed',
    inputSummary: '{"definitionId":"rsi"}',
    safety: 'read-only',
    reversible: false,
    ...overrides,
  }
}

describe('ToolCallCard', () => {
  it('renders the failed tool error and recommended action', () => {
    const wrapper = mount(ToolCallCard, {
      props: {
        locale: 'en',
        tool: tool({
          error: {
            code: 'INVALID_QUERY',
            message: 'The requested date is outside the active series.',
            retryable: true,
            recommendedAction: 'Choose a date within the loaded range.',
          },
        }),
      },
    })

    expect(wrapper.get('.tool-card__error').text()).toContain('INVALID_QUERY')
    expect(wrapper.text()).toContain('The requested date is outside the active series.')
    expect(wrapper.text()).toContain('Recommended action: Choose a date within the loaded range.')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
