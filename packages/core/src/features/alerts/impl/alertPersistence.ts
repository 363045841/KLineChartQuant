/** 浏览器应用级警报文档：整个应用共用一份 IndexedDB 仓库。 */
import { createIndexedDbDocumentStore } from '@/foundation/persistence/impl/indexedDbDocumentStore.js'
import { decodeAlertDocument } from './alertCodec.js'

/** 打开应用文档；仓库由调用方持有并释放。 */
export async function openBrowserAlertStore() {
  return createIndexedDbDocumentStore({
    databaseName: '@363045841yyt/klinechart-alerts',
    version: 1,
    storeName: 'alerts',
    key: 'state',
    codec: { decode: decodeAlertDocument, encode: (value) => value },
  })
}
