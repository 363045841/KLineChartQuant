import { describe, it, expect, afterAll } from 'vitest'
import { WebSocket } from 'ws'
import { createMcpServer } from '../mcpServer'

const PORT = 9876

const server = createMcpServer({
  serverInfo: { name: 'test', version: '1.0.0' },
  ws: { port: PORT, host: '127.0.0.1' },
})

afterAll(async () => {
  await server.stop()
})

function connectClient(sessionId = 'test-session'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('connectClient timeout'))
    }, 3000)

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'register', sessionId }))
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'registered' && msg.sessionId === sessionId) {
          clearTimeout(timeout)
          resolve(ws)
        }
      } catch {
        // ignore parse errors during connect
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

function waitForMessage(ws: WebSocket, timeout = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout)
    ws.once('message', (raw) => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(raw.toString()))
      } catch {
        reject(new Error('Failed to parse WS message'))
      }
    })
  })
}

describe('mcpServer WebSocket integration', { timeout: 10_000 }, () => {
  it('accepts registration and replies with registered', async () => {
    const ws = await connectClient('reg-test')
    expect(server.registry.has('reg-test')).toBe(true)
    ws.close()
  })

  it('registers session in the registry', async () => {
    const ws = await connectClient('registry-test')
    expect(server.registry.has('registry-test')).toBe(true)
    ws.close()
  })

  it('removes session on disconnect', async () => {
    const ws = await connectClient('disconnect-test')
    ws.close()
    await new Promise((r) => setTimeout(r, 150))
    expect(server.registry.has('disconnect-test')).toBe(false)
  })

  it('forwards tool:call and receives tool:result', async () => {
    const ws = await connectClient('tool-test')
    const handle = server.registry.get('tool-test')!

    const resultPromise = handle.executeTool({
      name: 'chart.zoomToLevel',
      input: { level: 5 },
    })

    const msg = (await waitForMessage(ws)) as {
      type: string
      requestId: string
      call: { name: string; input: Record<string, unknown> }
    }
    expect(msg.type).toBe('tool:call')
    expect(msg.call.name).toBe('chart.zoomToLevel')
    expect(msg.call.input).toEqual({ level: 5 })

    ws.send(
      JSON.stringify({
        type: 'tool:result',
        requestId: msg.requestId,
        result: { success: true },
      }),
    )

    const result = await resultPromise
    expect(result.success).toBe(true)
    ws.close()
  })

  it('accepts state:update and caches it', async () => {
    const ws = await connectClient('state-test')

    ws.send(
      JSON.stringify({
        type: 'state:update',
        descriptions: {
          vp: {
            controllerId: 'vp',
            summary: 'Test VP state',
            facts: { ready: true },
          },
        },
      }),
    )

    await new Promise((r) => setTimeout(r, 100))
    const state = server.registry.getState('state-test')
    expect(state?.vp?.summary).toBe('Test VP state')
    ws.close()
  })

  it('handles multiple concurrent sessions', async () => {
    const ws1 = await connectClient('multi-1')
    const ws2 = await connectClient('multi-2')

    expect(server.registry.getActiveSessionIds()).toContain('multi-1')
    expect(server.registry.getActiveSessionIds()).toContain('multi-2')

    ws1.close()
    ws2.close()
    await new Promise((r) => setTimeout(r, 150))
    expect(server.registry.has('multi-1')).toBe(false)
    expect(server.registry.has('multi-2')).toBe(false)
  })

  it('rejects invalid JSON gracefully', async () => {
    const ws = await connectClient('invalid-test')
    ws.send('not json')
    await new Promise((r) => setTimeout(r, 50))
    expect(server.registry.has('invalid-test')).toBe(true)
    ws.close()
  })
})
