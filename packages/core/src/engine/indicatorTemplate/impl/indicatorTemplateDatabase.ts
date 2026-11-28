/**
 * 指标模板库定义；模板文档版本由 `INDICATOR_TEMPLATE_VERSION` 管理。
 *
 * 数据库版本与文档版本解耦：这里固定为已发布的 1。
 */
import { ensureStore } from '@/foundation/persistence/migration/impl/database.js'
import type { DatabaseDefinition } from '@/foundation/persistence/migration/types.js'

const STORE_NAME = 'templates'

export const indicatorTemplateDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart-indicator-templates',
  storeName: STORE_NAME,
  steps: [{ version: 1, execute: (database) => ensureStore(database, STORE_NAME) }],
}
