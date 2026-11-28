/** 绘图模板库定义；模板列表按图元类型分键存放。 */
import { ensureStore } from '@/foundation/persistence/migration/impl/database.js'
import type { DatabaseDefinition } from '@/foundation/persistence/migration/types.js'

const STORE_NAME = 'templates'

export const drawingTemplateDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart-drawing-templates',
  storeName: STORE_NAME,
  steps: [{ version: 1, execute: (database) => ensureStore(database, STORE_NAME) }],
}
