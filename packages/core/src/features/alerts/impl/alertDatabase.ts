/** 警报库定义：规则与触发日志共用一份文档。 */
import { ensureStore } from '@/foundation/persistence/migration/impl/database.js'
import type { DatabaseDefinition } from '@/foundation/persistence/migration/types.js'

const STORE_NAME = 'alerts'

export const alertDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart-alerts',
  storeName: STORE_NAME,
  steps: [{ version: 1, execute: (database) => ensureStore(database, STORE_NAME) }],
}
