/** 桌面多窗口标签库定义。 */
import { ensureStore } from '@363045841yyt/klinechart-core/persistence'
import type { DatabaseDefinition } from '@363045841yyt/klinechart-core/persistence'

const STORE_NAME = 'workspaces'

export const workspaceTabsDatabase: DatabaseDefinition = {
  name: '@363045841yyt/klinechart-desktop',
  storeName: STORE_NAME,
  steps: [{ version: 1, execute: (database) => ensureStore(database, STORE_NAME) }],
}
