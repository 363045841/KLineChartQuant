import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { QuestionView } from '../agent-contracts'
import QuestionCard from '../components/QuestionCard.vue'

const DUPLICATE_LABEL_QUESTION: QuestionView = {
  id: 'question-1',
  toolCallId: 'tool-1',
  prompt: '代码 000012 对应多个标的，要添加哪一个作为对比？',
  options: [
    { value: 'index:sh', label: '国债指数', description: 'gotdx · index · SH' },
    { value: 'index:ex', label: '国债指数', description: 'gotdx · unknown · INDEX' },
  ],
  multiSelect: false,
  status: 'pending',
}

describe('QuestionCard', () => {
  it('selects only the clicked option even when labels repeat', async () => {
    const wrapper = mount(QuestionCard, {
      props: { question: DUPLICATE_LABEL_QUESTION, locale: 'en' },
    })
    const options = wrapper.findAll('.question__option')

    await options[1]!.trigger('click')

    expect(options[0]!.attributes('aria-checked')).toBe('false')
    expect(options[1]!.attributes('aria-checked')).toBe('true')

    await wrapper.get('.question__submit').trigger('click')
    expect(wrapper.emitted('answer')).toEqual([[{ selectedValues: ['index:ex'] }]])
  })
})
