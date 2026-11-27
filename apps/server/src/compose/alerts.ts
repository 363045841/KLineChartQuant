/**
 * 警报组合：规则与触发记录写入 SQLite，错误统一上报。
 */
import {
  createAlertRuntime,
  createDocumentStore,
  decodeFires,
  decodeRules,
  DEFAULT_ALERT_LIMITS,
  type AlertFiresDocument,
  type AlertRulesDocument,
  type AlertRuntime,
  type DocumentDriver,
  type MarketRuntime,
} from '@363045841yyt/klinechart-core/node'
import type { ServerConfig } from '../config.js'
import { createSqliteDriver } from '../node/sqliteDriver.js'

/** 警报装配结果；驱动由本层持有并在释放时关闭。 */
export interface AlertComposition {
  readonly alerts: AlertRuntime
  dispose(): Promise<void>
}

/**
 * 装配警报运行时。
 *
 * @param runtime - 共享运行时
 * @param config - 数据库路径
 * @param onError - 持久化与投递错误出口
 * @returns 警报运行时与统一释放入口
 */
export async function composeAlerts(
  runtime: MarketRuntime,
  config: ServerConfig,
  onError: (error: unknown) => void,
): Promise<AlertComposition> {
  const driver: DocumentDriver = createSqliteDriver({ filename: config.databasePath })
  const rules = createDocumentStore<AlertRulesDocument>({
    driver,
    storeName: 'alerts',
    key: 'rules',
    codec: { decode: decodeRules, encode: (value) => value },
  })
  const fires = createDocumentStore<AlertFiresDocument>({
    driver,
    storeName: 'alerts',
    key: 'fires',
    codec: { decode: decodeFires, encode: (value) => value },
  })
  const alerts = await createAlertRuntime({
    runtime,
    rules,
    fires,
    limits: DEFAULT_ALERT_LIMITS,
    onError,
  })
  let disposed = false
  return {
    alerts,
    async dispose() {
      if (disposed) return
      disposed = true
      await alerts.dispose()
      await driver.dispose()
    },
  }
}
