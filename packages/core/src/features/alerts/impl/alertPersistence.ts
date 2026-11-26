/**
 * 警报持久化：按命名空间隔离的文档仓库。
 *
 * 规则与触发日志分开存储；读取失败按损坏数据处理，不伪造空文档。
 */
import {
  createDocumentStore,
  createMemoryDocumentStore,
  type DocumentStore,
} from '../../../foundation/persistence/index.js'
import {
  ALERT_DOCUMENT_VERSION,
  type AlertFiresDocument,
  type AlertRulesDocument,
  decodeFires,
  decodeRules,
} from './alertCodec.js'

function store<T>(
  namespace: string,
  name: 'rules' | 'fires',
  decode: (value: unknown) => T,
): DocumentStore<T> {
  if (typeof indexedDB === 'undefined') return createMemoryDocumentStore<T>(null)
  return createDocumentStore({
    databaseName: `@363045841yyt/klinechart-alert-${namespace}-${name}`,
    version: ALERT_DOCUMENT_VERSION,
    storeName: name,
    key: name,
    codec: { decode, encode: (value) => value },
  })
}

/** 创建某一运行时的警报存储；命名空间由宿主决定。 */
export function createAlertStores(namespace: string): {
  rules: DocumentStore<AlertRulesDocument>
  fires: DocumentStore<AlertFiresDocument>
} {
  return {
    rules: store(namespace, 'rules', decodeRules),
    fires: store(namespace, 'fires', decodeFires),
  }
}
