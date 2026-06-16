import { createMcpServer } from '../src/mcpServer'

const WS_PORT = Number(process.env.WS_PORT) || 8080
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'stdio'

const { start, stop, wss } = createMcpServer({
  serverInfo: {
    name: 'klinechart-ai-mcp',
    version: '0.0.0',
  },
  ws: {
    port: WS_PORT,
    host: '0.0.0.0',
  },
})

wss.on('listening', () => {
  console.error(`[ai-runtime] WebSocket server listening on ws://0.0.0.0:${WS_PORT}`)
  console.error(`[ai-runtime] MCP transport: ${MCP_TRANSPORT}`)
  if (MCP_TRANSPORT === 'stdio') {
    console.error(`[ai-runtime] Ready for stdio MCP connection`)
  }
})

process.on('SIGINT', async () => {
  console.error('\n[ai-runtime] Shutting down...')
  await stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stop()
  process.exit(0)
})

process.stdin.on('end', () => {
  console.error('[ai-runtime] stdin closed, shutting down...')
  stop().then(() => process.exit(0))
})

process.on('exit', () => {
  for (const ws of wss.clients) {
    ws.terminate()
  }
})

start().catch((err) => {
  console.error('[ai-runtime] Failed to start:', err)
  process.exit(1)
})
