// 失败提示组件测试：本地化标题、官方原文、恢复动作与中止不打扰。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { RunFailureReason } from '../../agent-contracts.js'
import AgentRunFailureNotice from '../AgentRunFailureNotice.vue'

/** 挂载提示；原因取官方枚举，详情可选。 */
function mountNotice(runFailure: { reason: RunFailureReason; detail?: string }) {
  return mount(AgentRunFailureNotice, { props: { runFailure, locale: 'en' } })
}

describe('AgentRunFailureNotice', () => {
  it.each<[RunFailureReason, string, string]>([
    ['model_error', 'The model request failed.', 'resume'],
    ['no_model', 'No model is available.', 'configure'],
  ])('%s 显示本地化标题并发出 %s', async (reason, title, event) => {
    const wrapper = mountNotice({ reason, detail: 'upstream 502' })

    expect(wrapper.text()).toContain(title)
    expect(wrapper.text()).toContain('upstream 502')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted(event)).toHaveLength(1)
  })

  it.each([
    ['faulted', true],
    ['nothing_to_answer', true],
    ['aborted', false],
    ['reset', false],
  ] as const)('%s 的展示 %s 与动作无关', (reason, renders) => {
    const notice = mountNotice({ reason }).find('[data-focus="run-failure"]')

    expect(notice.exists()).toBe(renders)
    if (renders) expect(notice.find('button').exists()).toBe(false)
  })
})
