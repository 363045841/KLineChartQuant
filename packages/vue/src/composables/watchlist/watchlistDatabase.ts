/** 自选股库定义：列表与分组偏好共用同一个 store。 */
import { ensureStore } from '@363045841yyt/klinechart-core/persistence'
import type { DatabaseDefinition } from '@363045841yyt/klinechart-core/persistence'

const STORE_NAME = 'watchlist'

export const watchlistDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart',
  storeName: STORE_NAME,
  steps: [{ version: 1, execute: (database) => ensureStore(database, STORE_NAME) }],
}
