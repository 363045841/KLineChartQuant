/** IndexedDB 脚本工作区适配器。 */
import { createIndexedDbDocumentStore } from '@363045841yyt/klinechart-core/persistence'
import type { ScriptPersistence } from '../types.js'
import { scriptDatabase } from './scriptDatabase.js'
import { decodeScriptWorkspace } from './scriptWorkspaceCodec.js'

/** 保存和读取同一份脚本工作区。 */
export function createIndexedDbScriptPersistence(): ScriptPersistence {
  const store = createIndexedDbDocumentStore({
    database: scriptDatabase,
    key: 'documents',
    codec: { decode: decodeScriptWorkspace, encode: (value) => value },
  })
  return { load: store.read, async save(workspace) { await store.write(workspace); return true }, dispose: store.dispose }
}
