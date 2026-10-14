/** 用户脚本文档持久化：复用 Core 的 IndexedDB API 保存整份用户源码列表。 */
import { createIndexedDbPersistence } from '@363045841yyt/klinechart-core'
import type { SavedScript, ScriptPersistence } from '../types.js'

/** 校验存储边界，损坏的数据不能被空列表覆盖。 */
function decode(value: unknown): readonly SavedScript[] {
  if (!Array.isArray(value)) throw new Error('用户脚本存储格式错误')
  return value.map((item: unknown) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('source' in item) ||
      typeof item.source !== 'string' ||
      !('revision' in item) ||
      typeof item.revision !== 'number' ||
      !Number.isInteger(item.revision) ||
      item.revision < 1
    )
      throw new Error('用户脚本文档格式错误')
    return { source: item.source, revision: item.revision }
  })
}

/** 创建工作区隔离的用户脚本存储，显式保存直接等待事务完成。 */
export function createScriptPersistence(): ScriptPersistence {
  return createIndexedDbPersistence<readonly SavedScript[]>({
    databaseName: '@363045841yyt/klinechart-user-scripts',
    storeName: 'scripts',
    key: 'documents',
    codec: { decode, encode: (value) => value },
    flushOnPageHide: false,
    strictLoad: true,
  })
}
