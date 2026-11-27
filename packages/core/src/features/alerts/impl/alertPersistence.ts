/**
 * 警报持久化：浏览器组合根使用的 IndexedDB 仓库装配。
 *
 * 规则与触发日志是两个独立文档；仓库由调用方持有并释放。没有可用实现时直接失败，
 * 不退回内存，避免进程无报错但重启后规则全丢。
 */
import {
  createIndexedDbDocumentStore,
  type DocumentStore,
} from '../../../foundation/persistence/index.js'
import {
  ALERT_DOCUMENT_VERSION,
  type AlertFiresDocument,
  type AlertRulesDocument,
  decodeFires,
  decodeRules,
} from './alertCodec.js'

/**
 * 创建某一命名空间的规则仓库。
 *
 * @param namespace - 工作区命名空间，与浏览器持久化作用域拼接
 * @param name - 文档名，同时用作 store 名与记录键
 * @param decode - 结构校验与解码
 */
function store<T>(
  namespace: string,
  name: 'rules' | 'fires',
  decode: (value: unknown) => T,
): DocumentStore<T> {
  return createIndexedDbDocumentStore<T>({
    databaseName: `@363045841yyt/klinechart-alert-${namespace}-${name}`,
    version: ALERT_DOCUMENT_VERSION,
    storeName: name,
    key: name,
    codec: { decode, encode: (value) => value },
  })
}

/** 创建某一运行时的规则与触发存储；两者独立释放。 */
export function createAlertStores(namespace: string): {
  rules: DocumentStore<AlertRulesDocument>
  fires: DocumentStore<AlertFiresDocument>
} {
  return {
    rules: store(namespace, 'rules', decodeRules),
    fires: store(namespace, 'fires', decodeFires),
  }
}
