/** IndexedDB 脚本工作区适配器。 */
import { createIndexedDbDocumentStore } from '@363045841yyt/klinechart-core/persistence'
import type { ScriptPersistence } from '../types.js'
import { decodeScriptWorkspace } from './scriptWorkspaceCodec.js'

/** 保存和读取同一份脚本工作区。 */
export function createIndexedDbScriptPersistence(): ScriptPersistence {
  const store = createIndexedDbDocumentStore({
    databaseName: '@363045841yyt/klinechart-user-scripts-v2', version: 1,
    storeName: 'scripts', key: 'documents', codec: { decode: decodeScriptWorkspace, encode: (value) => value },
  })
  return { load: store.read, async save(workspace) { await store.write(workspace); return true }, dispose: store.dispose }
}
