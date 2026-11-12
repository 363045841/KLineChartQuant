// 空态快捷提问：按钮只显示短标签，点击发送完整指令。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getAgentCopy } from '../../agent-copy.js'
import AgentTimelineEmptyState from '../AgentTimelineEmptyState.vue'

describe('AgentTimelineEmptyState', () => {
  it('订单流这一条显示短标签，发送带标注规则的完整指令', async () => {
    const wrapper = mount(AgentTimelineEmptyState, { props: { locale: 'zh-CN' } })
    const copy = getAgentCopy('zh-CN')
    const buttons = wrapper.findAll('button')
    const orderflow = buttons.at(4)

    expect(orderflow?.text()).toContain(copy.promptOrderflow)
    expect(orderflow?.text()).not.toContain(copy.promptOrderflowDetail)

    await orderflow?.trigger('click')

    expect(wrapper.emitted('prompt')?.[0]).toEqual([copy.promptOrderflowDetail])
    expect(copy.promptOrderflowDetail).toContain('orderflow_snapshot')
    expect(copy.promptOrderflowDetail).toContain('订单流')
    // 观测区间小结：要带依据与失效条件，而不是只报一句「画了什么」
    expect(copy.promptOrderflowDetail).toContain('观测区间')
    expect(copy.promptOrderflowDetail).toContain('失效条件')
    expect(copy.promptOrderflowDetail).not.toContain('买卖方向')
    wrapper.unmount()
  })

  it('其余四条发送与标签相同的文本', async () => {
    const wrapper = mount(AgentTimelineEmptyState, { props: { locale: 'en' } })
    const copy = getAgentCopy('en')

    await wrapper.findAll('button').at(0)?.trigger('click')

    expect(wrapper.emitted('prompt')?.[0]).toEqual([copy.promptTrend])
    wrapper.unmount()
  })
})
