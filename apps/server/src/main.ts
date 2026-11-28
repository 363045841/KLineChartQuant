/**
 * Node 宿主入口：解析 flag、装配运行时、启动只读 HTTP 服务。
 */
import type { Server } from 'node:http'
import { parseConfig } from './config.js'
import { composeRoot } from './compose/root.js'
import { createHttpServer } from './http/server.js'
import { createEventStream } from './node/eventStream.js'

/** 统一错误出口：写 stderr，不吞掉异常。 */
function reportError(error: unknown): void {
  console.error('[server]', error instanceof Error ? error.message : String(error))
}

/** 启动服务；失败时以非零码退出。 */
async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2))
  const fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)
  const root = await composeRoot(config, fetchImpl, createEventStream(fetchImpl), reportError)
  const startedAt = Date.now()
  console.log(
    `[server] definitions: ${root.runtime.definitions.readDefinitions().length}, failures: ${root.runtime.definitions.failures.peek().length}`,
  )

  const server: Server = createHttpServer({
    health: () => ({
      ok: true,
      uptimeMs: Date.now() - startedAt,
      sources: root.runtime.market.registry.getAll().map((provider) => ({
        id: provider.source.id,
        enabled: root.runtime.market.registry.getConfig(provider.source.id).enabled,
      })),
    }),
    alerts: () => root.alerts.alerts.peek(),
    fires: () => root.alerts.fires.peek(),
  })

  /** 关闭顺序：停止接收请求，再释放运行时。 */
  let closing = false
  async function shutdown(signal: string): Promise<void> {
    if (closing) return
    closing = true
    console.log(`[server] received ${signal}, shutting down`)
    try { await new Promise<void>((resolve) => server.close(() => resolve())) }
    finally { await root.dispose() }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(config.port, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
  } catch (error) {
    await root.dispose()
    throw error
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void shutdown(signal).catch((error) => { reportError(error); process.exitCode = 1 }) })
  }
  console.log(`[server] listening on http://127.0.0.1:${config.port}`)
}

void main().catch((error: unknown) => {
  reportError(error)
  process.exit(1)
})
