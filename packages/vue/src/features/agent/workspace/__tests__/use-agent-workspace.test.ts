// 验证工作区在运行时初始化失败时进入不可用状态，并可通过重试恢复。
import { AgentRuntimeError } from '@363045841yyt/klinechart-agent-runtime'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { FakeAgentBridge } from '../../__tests__/fake-agent-bridge'
import { useAgentWorkspace } from '../impl/use-agent-workspace'

type Workspace = ReturnType<typeof useAgentWorkspace>

/** 在真实组件上下文中运行 composable，以便触发 onMounted 初始化。 */
function mountWorkspace(bridge: FakeAgentBridge) {
  let workspace!: Workspace
  const Host = defineComponent({
    setup() {
      workspace = useAgentWorkspace(bridge)
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, workspace }
}

describe('useAgentWorkspace availability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enters the unavailable state on a runtime failure and recovers on retry', async () => {
    const bridge = new FakeAgentBridge()
    vi.spyOn(bridge, 'listSessions').mockRejectedValueOnce(
      new AgentRuntimeError('TARGET_LOST', 'The Agent client is not attached to the host.', {
        retryable: true,
      }),
    )
    const { wrapper, workspace } = mountWorkspace(bridge)

    await flushPromises()
    expect(workspace.availability.value).toEqual({
      status: 'unavailable',
      error: expect.objectContaining({ code: 'TARGET_LOST', retryable: true }),
    })

    await workspace.retryInitialize()
    await flushPromises()
    expect(workspace.availability.value).toEqual({ status: 'ready' })
    expect(workspace.state.value.sessions.length).toBeGreaterThan(0)
    wrapper.unmount()
  })
})

describe('useAgentWorkspace run failure', () => {
  it('projects the official failure and resumes with the native continue', async () => {
    const bridge = new FakeAgentBridge({ providerConfigured: true })
    const { wrapper, workspace } = mountWorkspace(bridge)
    await flushPromises()

    bridge.failRun('1', { reason: 'model_error', detail: 'upstream 502' })
    await flushPromises()
    expect(workspace.runFailure.value).toEqual({ reason: 'model_error', detail: 'upstream 502' })

    const continueRun = vi.spyOn(bridge, 'continueRun')
    await workspace.resume()
    expect(continueRun).toHaveBeenCalledWith({ sessionId: '1', mode: 'build' })
    wrapper.unmount()
  })

  it('surfaces a failed reopen instead of keeping an empty timeline', async () => {
    const bridge = new FakeAgentBridge()
    const { wrapper, workspace } = mountWorkspace(bridge)
    await flushPromises()

    vi.spyOn(bridge, 'openSession').mockRejectedValueOnce(
      new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session does not exist.'),
    )
    await workspace.selectSession('1')
    await flushPromises()

    expect(workspace.availability.value).toEqual({
      status: 'unavailable',
      error: expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    })
    wrapper.unmount()
  })
})
