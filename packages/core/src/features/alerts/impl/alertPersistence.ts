/** 浏览器应用级警报文档；首次打开时一次性导入旧标签的记录。 */
import { createIndexedDbDocumentStore } from '@/foundation/persistence/impl/indexedDbDocumentStore.js'
import { createIndexedDbDriver } from '@/foundation/persistence/impl/indexedDbDriver.js'
import { scopedPersistenceName } from '@/foundation/persistence/persistence-scope.js'
import { decodeAlertDocument, importAlertDocuments } from './alertCodec.js'

/** 打开应用文档，只有首次创建时读取旧存储；原始文档保留供恢复。 */
export async function openBrowserAlertStore() {
  const document = createIndexedDbDocumentStore({
    databaseName: '@363045841yyt/klinechart-alerts', version: 1,
    storeName: 'alerts', key: 'state', codec: { decode: decodeAlertDocument, encode: (value) => value },
  })
  try {
    if (await document.read()) return document
    const prefix = '@363045841yyt/klinechart-alert-'
    const scopedPrefix = scopedPersistenceName(prefix)
    const databases = await indexedDB.databases()
    const rules: unknown[] = []
    const fires: unknown[] = []
    for (const { name } of databases) {
      if (!name?.startsWith(scopedPrefix)) continue
      const kind = name.endsWith('-rules') ? 'rules' : name.endsWith('-fires') ? 'fires' : null
      if (!kind) continue
      const driver = createIndexedDbDriver({ databaseName: prefix + name.slice(scopedPrefix.length), version: 1 })
      try {
        const value = await driver.transaction([kind], 'readonly', (tx) => tx.get(kind, kind))
        if (value !== undefined) (kind === 'rules' ? rules : fires).push(value)
      } finally {
        await driver.dispose()
      }
    }
    await document.update((current) => current ?? importAlertDocuments(rules, fires))
    return document
  } catch (error) {
    await document.dispose()
    throw error
  }
}
