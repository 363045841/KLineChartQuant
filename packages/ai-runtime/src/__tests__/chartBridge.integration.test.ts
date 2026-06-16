import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { WebSocketServer, WebSocket as WsWebSocket, type WebSocket } from 'ws'
import { ChartBridge } from '@363045841yyt/klinechart-core'

const PORT = 9877
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' })

const receivedMessages: unknown[] = []
let serverWs: WebSocket | null = null

wss.on('connection', (ws) => {
  serverWs = ws
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    receivedMessages.push(msg)

    if (msg.type === 'register') {
      ws.send(JSON.stringify({ type: 'registered', sessionId: msg.sessionId }))
    }
  })
})

afterAll(() => {
  wss.close()
})

describe('ChartBridge integration', { timeout: 10_000 }, () => {
  beforeEach(() => {
    receivedMessages.length = 0
  })

  it('connects and registers with server', async () => {
    const bridge = new ChartBridge({
      wsUrl: `ws://127.0.0.1:${PORT}`,
      sessionId: 'bridge-test',
      autoReconnect: false,
      wsImpl: WsWebSocket as unknown as new (url: string) => WebSocket,
    })

    await bridge.connect()
    await new Promise((r) => setTimeout(r, 100))

    const regMsg = receivedMessages.find(
      (m: unknown) => (m as { type: string }).type === 'register',
    ) as { sessionId: string } | undefined
    expect(regMsg).toBeDefined()
    expect(regMsg!.sessionId).toBe('bridge-test')

    bridge.disconnect()
  })

  it('sends state update', async () => {
    const bridge = new ChartBridge({
      wsUrl: `ws://127.0.0.1:${PORT}`,
      sessionId: 'state-push-test',
      autoReconnect: false,
      wsImpl: WsWebSocket as unknown as new (url: string) => WebSocket,
    })

    await bridge.connect()
    await new Promise((r) => setTimeout(r, 100))

    bridge.sendStateUpdate({
      testController: {
        controllerId: 'testController',
        summary: 'Test state',
        facts: { value: 42 },
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    const stateMsg = receivedMessages.find(
      (m: unknown) => (m as { type: string }).type === 'state:update',
    )
    expect(stateMsg).toBeDefined()
    expect(
      (stateMsg as { descriptions: Record<string, unknown> }).descriptions
        .testController,
    ).toBeDefined()

    bridge.disconnect()
  })

  it('auto-generates sessionId when not provided', () => {
    const bridge = new ChartBridge({
      wsUrl: `ws://127.0.0.1:${PORT}`,
      autoReconnect: false,
      wsImpl: WsWebSocket as unknown as new (url: string) => WebSocket,
    })
    expect(bridge.sessionId).toBeDefined()
    expect(bridge.sessionId.length).toBeGreaterThan(0)
    bridge.disconnect()
  })

  it('isSafe to call destroy multiple times', () => {
    const bridge = new ChartBridge({
      wsUrl: `ws://127.0.0.1:${PORT}`,
      autoReconnect: false,
      wsImpl: WsWebSocket as unknown as new (url: string) => WebSocket,
    })
    bridge.destroy()
    bridge.destroy()
  })
})
