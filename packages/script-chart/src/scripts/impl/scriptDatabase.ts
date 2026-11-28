/** 用户脚本库定义；工作区文档形状由 codec 校验。 */
import { ensureStore } from '@363045841yyt/klinechart-core/persistence'
import type { DatabaseDefinition } from '@363045841yyt/klinechart-core/persistence'

const STORE_NAME = 'scripts'

export const scriptDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart-user-scripts-v2',
  storeName: STORE_NAME,
  steps: [{ version: 1, execute: (database) => ensureStore(database, STORE_NAME) }],
}
