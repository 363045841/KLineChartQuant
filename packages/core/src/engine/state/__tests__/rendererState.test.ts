import { describe, expect, it, vi } from 'vitest'

import { createRendererState } from '../rendererState'

describe('rendererState', () => {
  it('publishes immutable backend runtime snapshots through an Action', () => {
    const state = createRendererState({ effective: 'webgl', status: 'ready', error: null })
    const listener = vi.fn()
    state.readonly.runtime.subscribe(listener)

    state.actions.setRuntime({
      effective: 'canvas',
      status: 'degraded',
      error: 'WebGPU adapter unavailable',
    })

    expect(state.readonly.runtime.peek()).toEqual({
      effective: 'canvas',
      status: 'degraded',
      error: 'WebGPU adapter unavailable',
    })
    expect(Object.isFrozen(state.readonly.runtime.peek())).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('does not notify for an identical runtime', () => {
    const runtime = { effective: 'webgpu', status: 'ready', error: null } as const
    const state = createRendererState(runtime)
    const listener = vi.fn()
    state.readonly.runtime.subscribe(listener)

    state.actions.setRuntime({ ...runtime })

    expect(listener).not.toHaveBeenCalled()
  })
})
