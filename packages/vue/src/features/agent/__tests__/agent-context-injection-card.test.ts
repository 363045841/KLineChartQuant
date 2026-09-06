import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AgentContextInjectionCard from '../components/AgentContextInjectionCard.vue'

describe('AgentContextInjectionCard', () => {
  it('reveals every injected ContextItem on demand', async () => {
    const content = [
      'market bars | symbol=BTCUSDT | source=fixture | timezone=UTC | period=daily | adjustment=none | olderData=-',
      '',
      '| time | open | high | low | close | volume |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 2026-09-02 00:00 | 1 | 2 | 0 | 1 | 100 |',
      '| 2026-09-03 00:00 | 2 | 3 | 1 | 2 | 200 |',
    ].join('\n')
    const wrapper = mount(AgentContextInjectionCard, {
      props: {
        contextItems: [
          { kind: 'chart-symbol', value: { symbol: 'BTCUSDT', name: 'Bitcoin / Tether' } },
          {
            kind: 'selected-time-range',
            value: { from: '2026-09-02 00:00', to: '2026-09-03 00:00' },
          },
          { kind: 'selected-kline-bars', value: { content } },
        ],
        locale: 'en',
      },
    })

    expect(wrapper.get('.injection-card__count').text()).toBe('3 ContextItems injected')
    expect(wrapper.find('.injection-card__data').exists()).toBe(false)

    await wrapper.get('.injection-card__summary').trigger('click')

    expect(wrapper.get('.injection-card__summary').attributes('aria-expanded')).toBe('true')
    const preview = wrapper.get('.injection-card__data').text()
    expect(preview).toContain('"kind": "chart-symbol"')
    expect(preview).toContain('"kind": "selected-time-range"')
    expect(preview).toContain('"kind": "selected-kline-bars"')
    expect(preview).toContain(JSON.stringify(content))
  })
})
