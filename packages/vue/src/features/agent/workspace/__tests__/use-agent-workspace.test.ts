// 验证工作区在运行时初始化失败时进入不可用状态，并可通过重试恢复。
import { AgentRuntimeError } from '@363045841yyt/klinechart-agent-runtime'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { FakeAgentBridge } from '../../testing/fake-agent-bridge'
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

  it('enters the unavailable state on a locked runtime and recovers on retry', async () => {
    const bridge = new FakeAgentBridge()
    vi.spyOn(bridge, 'listSessions').mockRejectedValueOnce(
      new AgentRuntimeError('SESSION_LOCKED', 'Agent sessions are open in another page.', {
        retryable: true,
      }),
    )
    const { wrapper, workspace } = mountWorkspace(bridge)

    await flushPromises()
    expect(workspace.availability.value).toEqual({
      status: 'unavailable',
      error: expect.objectContaining({ code: 'SESSION_LOCKED', retryable: true }),
    })

    await workspace.retryInitialize()
    await flushPromises()
    expect(workspace.availability.value).toEqual({ status: 'ready' })
    expect(workspace.state.value.sessions.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('recovers by itself when the lock holder closes', async () => {
    vi.useFakeTimers()
    const bridge = new FakeAgentBridge()
    const listSessions = vi.spyOn(bridge, 'listSessions').mockRejectedValueOnce(
      new AgentRuntimeError('SESSION_LOCKED', 'Agent sessions are open in another page.', {
        retryable: true,
      }),
    )
    const { wrapper, workspace } = mountWorkspace(bridge)

    await flushPromises()
    expect(workspace.availability.value).toMatchObject({ status: 'unavailable' })

    // 锁释放后不需要用户点击：定时重试自行恢复
    await vi.advanceTimersByTimeAsync(3_000)
    await flushPromises()
    expect(workspace.availability.value).toEqual({ status: 'ready' })

    // 恢复后停止重试，避免继续轮询
    const callsAfterRecovery = listSessions.mock.calls.length
    await vi.advanceTimersByTimeAsync(9_000)
    expect(listSessions.mock.calls.length).toBe(callsAfterRecovery)

    wrapper.unmount()
    vi.useRealTimers()
  })
})
