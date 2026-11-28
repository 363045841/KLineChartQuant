/**
 * 布局库定义：数据库结构版本独立于 LayoutDocument 版本。
 *
 * 已发布库版本固定为 4，只能升不能降；文档字段变化改 `LAYOUT_DOCUMENT_VERSION`，
 * 不要动这里。
 */
import { ensureStore } from '@/foundation/persistence/migration/impl/database.js'
import type { DatabaseDefinition } from '@/foundation/persistence/migration/types.js'

const STORE_NAME = 'layouts'

export const layoutDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart-layouts',
  storeName: STORE_NAME,
  steps: [{ version: 4, execute: (database) => ensureStore(database, STORE_NAME) }],
}
