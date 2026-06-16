import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const devScriptPath = resolve(__dirname, 'dev.ts')

async function main() {
  console.log('Starting MCP server...')

  const child = spawn('npx', ['tsx', devScriptPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    cwd: resolve(__dirname, '..'),
    shell: true,
  })

  const stdin = child.stdin!
  const stdout = child.stdout!

  let buffer = ''
  let msgId = 0

  function send(method: string, params?: unknown) {
    msgId++
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      id: msgId,
      method,
      params: params ?? {},
    })
    console.log('\n→', msg)
    stdin.write(msg + '\n')
  }

  function waitForResponse(id: number, timeout = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Response timeout')), timeout)

      // fallow-ignore-next-line complexity
      function onData(chunk: Buffer) {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const resp = JSON.parse(line)
            if (resp.id === id) {
              clearTimeout(timer)
              stdout.removeListener('data', onData)
              resolve(resp)
            }
          } catch {
            // incomplete JSON, keep buffering
          }
        }
      }

      stdout.on('data', onData)
    })
  }

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 1000))

  // Step 1: Initialize
  send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  })
  const initResp = await waitForResponse(1)
  console.log('←', JSON.stringify(initResp, null, 2))

  // Step 2: Send initialized notification
  send('notifications/initialized')

  // Step 3: List tools
  send('tools/list')
  const toolsResp = await waitForResponse(2)
  console.log('\n← tools/list:', JSON.stringify(toolsResp, null, 2))

  const tools = (toolsResp as { result?: { tools?: unknown[] } }).result?.tools ?? []
  console.log(`\n✅ Registered ${tools.length} tools:`)
  for (const t of tools) {
    console.log(`   - ${(t as { name?: string }).name}`)
  }

  child.kill()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
