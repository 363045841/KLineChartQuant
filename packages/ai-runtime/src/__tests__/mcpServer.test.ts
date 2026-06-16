import { describe, it, expect } from 'vitest'
import { createMcpServer } from '../mcpServer'
import { SessionRegistry } from '../sessionRegistry'

describe('createMcpServer', () => {
  it('returns server components', () => {
    const instance = createMcpServer({
      ws: { port: 0 },
    })
    expect(instance.server).toBeDefined()
    expect(instance.registry).toBeDefined()
    expect(instance.wss).toBeDefined()
    expect(typeof instance.start).toBe('function')
    expect(typeof instance.stop).toBe('function')
  })

  it('uses provided registry', () => {
    const registry = new SessionRegistry()
    const instance = createMcpServer({ registry, ws: { port: 0 } })
    expect(instance.registry).toBe(registry)
  })

  it('accepts custom server info', () => {
    const instance = createMcpServer({
      serverInfo: { name: 'custom', version: '2.0.0' },
      ws: { port: 0 },
    })
    expect(instance.server).toBeDefined()
  })
})
