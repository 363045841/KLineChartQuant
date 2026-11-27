/**
 * Node 宿主入口：解析 flag、装配运行时、启动只读 HTTP 服务。
 */
import type { Server } from 'node:http'
import { parseConfig } from './config.js'
import { composeRoot } from './compose/root.js'
import { createHttpServer } from './http/server.js'
import { createFetchEventStream } from './node/fetchEventStream.js'

/** 统一错误出口：写 stderr，不吞掉异常。 */
function reportError(error: unknown): void {
  console.error('[server]', error instanceof Error ? error.message : String(error))
}

/** 启动服务；失败时以非零码退出。 */
async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2))
  const fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)
  const openEventStream = createFetchEventStream(fetchImpl)
  const root = await composeRoot(config, fetchImpl, openEventStream, reportError)
  const startedAt = Date.now()
  console.log(
    `[server] definitions: ${root.runtime.definitions.readDefinitions().length}, failures: ${root.runtime.definitions.failures.peek().length}`,
  )

  const server: Server = createHttpServer(config.port, {
    health: () => ({
      ok: true,
      uptimeMs: Date.now() - startedAt,
      sources: root.market.registry.getAll().map((provider) => ({
        id: provider.source.id,
        enabled: root.market.registry.getConfig(provider.source.id).enabled,
      })),
    }),
    alerts: () => root.alerts.alerts.service.alerts.peek(),
    fires: () => root.alerts.alerts.service.fires.peek(),
  })

  /** 关闭顺序：停止接收请求，再释放运行时。 */
  async function shutdown(signal: string): Promise<void> {
    console.log(`[server] received ${signal}, shutting down`)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await root.dispose()
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT').then(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').then(() => process.exit(0))
  })

  server.listen(config.port, '127.0.0.1')
}

void main().catch((error: unknown) => {
  reportError(error)
  process.exit(1)
})
