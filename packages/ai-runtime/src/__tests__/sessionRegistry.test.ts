import { describe, it, expect } from 'vitest'
import { SessionRegistry, type SessionHandle } from '../sessionRegistry'
import type { ToolCall, ToolResult } from '../executeTool'

function createMockHandle(sessionId: string): SessionHandle {
  return {
    sessionId,
    executeTool: async (call: ToolCall): Promise<ToolResult> => ({
      success: true,
      data: { handled: call.name },
    }),
  }
}

describe('SessionRegistry', () => {
  it('registers and retrieves a session', () => {
    const registry = new SessionRegistry()
    const handle = createMockHandle('s1')
    registry.register('s1', handle)
    expect(registry.get('s1')).toBe(handle)
    expect(registry.has('s1')).toBe(true)
  })

  it('unregisters a session', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.unregister('s1')
    expect(registry.get('s1')).toBeUndefined()
    expect(registry.has('s1')).toBe(false)
  })

  it('returns active session ids', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.register('s2', createMockHandle('s2'))
    expect(registry.getActiveSessionIds()).toEqual(['s1', 's2'])
  })

  it('returns empty array when no sessions', () => {
    const registry = new SessionRegistry()
    expect(registry.getActiveSessionIds()).toEqual([])
  })

  it('handles duplicate registration gracefully', () => {
    const registry = new SessionRegistry()
    const oldHandle = createMockHandle('s1')
    const newHandle = createMockHandle('s1')
    registry.register('s1', oldHandle)
    registry.register('s1', newHandle)
    expect(registry.get('s1')).toBe(newHandle)
  })
})

describe('SessionRegistry - state management', () => {
  it('initializes with empty state on register', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    expect(registry.getState('s1')).toEqual({})
  })

  it('updates state for a session', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.updateState('s1', {
      volumeProfile: {
        controllerId: 'volumeProfile',
        summary: 'VP ready',
        facts: { ready: true },
      },
    })
    expect(registry.getState('s1')?.volumeProfile?.summary).toBe('VP ready')
  })

  it('merges state on multiple updates', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.updateState('s1', {
      vp: { controllerId: 'vp', summary: 'VP', facts: {} },
    })
    registry.updateState('s1', {
      alerts: { controllerId: 'alerts', summary: 'Alerts', facts: {} },
    })
    const state = registry.getState('s1')!
    expect(state.vp?.summary).toBe('VP')
    expect(state.alerts?.summary).toBe('Alerts')
  })

  it('clears state on unregister', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.updateState('s1', {
      vp: { controllerId: 'vp', summary: 'VP', facts: {} },
    })
    registry.unregister('s1')
    expect(registry.getState('s1')).toBeUndefined()
  })
})

describe('SessionRegistry - summary generation', () => {
  it('returns placeholder when no controllers described', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    expect(registry.getSummary('s1')).toBe('No controllers described.')
  })

  it('builds summary from controller descriptions', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.updateState('s1', {
      vp: {
        controllerId: 'volumeProfile',
        summary: 'POC at 50000, VA 49000-51000',
        facts: { poc: 50000 },
      },
    })
    const summary = registry.getSummary('s1')
    expect(summary).toContain('volumeProfile')
    expect(summary).toContain('POC at 50000')
  })

  it('joins multiple controller summaries', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.updateState('s1', {
      vp: { controllerId: 'vp', summary: 'VP ready', facts: {} },
      alerts: { controllerId: 'alerts', summary: '3 rules', facts: {} },
    })
    const summary = registry.getSummary('s1')
    expect(summary).toContain('VP ready')
    expect(summary).toContain('3 rules')
  })

  it('returns "No controllers described" when state is empty object', () => {
    const registry = new SessionRegistry()
    registry.register('s1', createMockHandle('s1'))
    registry.updateState('s1', {})
    expect(registry.getSummary('s1')).toBe('No controllers described.')
  })
})
