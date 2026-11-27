/** Node 进程唯一组合根，拥有行情、警报存储和脚本线程。 */
import {
  createAlertRuntime, createDefinitionRegistry, createDocumentStore, createMarketRuntime,
  decodeAlertDocument, DEFAULT_ALERT_LIMITS, importAlertDocuments, installBuiltinProviders,
  MarketDataContext, MarketDataProviderRegistry, systemClock, type EventStreamFactory,
} from '@363045841yyt/klinechart-core/node'
import type { ServerConfig } from '../config.js'
import { createSqliteDriver } from '../node/sqliteDriver.js'
import { composeScripts } from './scripts.js'

/** 装配服务并在初始化失败时释放已取得的资源。 */
export async function composeRoot(config: ServerConfig, fetchImpl: typeof fetch, openEventStream: EventStreamFactory, onError: (error: unknown) => void) {
  const registry = new MarketDataProviderRegistry()
  installBuiltinProviders(registry, { fetchImpl, openEventStream })
  for (const source of config.sources) registry.getRequired(source)
  const enabled = new Set(config.sources)
  for (const { source } of registry.getAll()) registry.setConfig(source.id, { enabled: enabled.has(source.id) })

  const driver = createSqliteDriver({ filename: config.databasePath })
  const market = new MarketDataContext(registry)
  const definitions = createDefinitionRegistry()
  const runtime = createMarketRuntime({ market, definitions, clock: systemClock })
  const document = createDocumentStore({
    driver, storeName: 'alerts', key: 'state', codec: { decode: decodeAlertDocument, encode: (value) => value },
  })
  async function release() {
    runtime.dispose()
    definitions.dispose()
    market.dispose()
    await driver.dispose()
  }
  try {
    if (!(await document.read())) {
      await driver.transaction(['alerts'], 'readwrite', async (tx) => {
        const rules = await tx.get('alerts', 'rules')
        const fires = await tx.get('alerts', 'fires')
        await tx.put('alerts', importAlertDocuments(rules === undefined ? [] : [rules], fires === undefined ? [] : [fires]), 'state')
      })
    }
    const alerts = await createAlertRuntime({ runtime, document, limits: DEFAULT_ALERT_LIMITS, onError })
    try {
      const scripts = await composeScripts(config, definitions, (id) => alerts.alerts.peek().some((rule) => rule.script.definitionId === id))
      return { runtime, alerts, async dispose() {
        try { await alerts.dispose() } finally {
          scripts.dispose()
          await release()
        }
      } }
    } catch (error) {
      await alerts.dispose()
      throw error
    }
  } catch (error) {
    await document.dispose()
    await release()
    throw error
  }
}
