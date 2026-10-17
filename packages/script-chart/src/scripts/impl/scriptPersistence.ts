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
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      !('source' in item) ||
      typeof item.source !== 'string' ||
      !('revision' in item) ||
      typeof item.revision !== 'number' ||
      !Number.isInteger(item.revision) ||
      item.revision < 1
    )
      throw new Error('用户脚本文档格式错误')
    if ('trusted' in item && typeof item.trusted !== 'boolean') {
      throw new Error('用户脚本信任状态格式错误')
    }
    // 既有文档没有信任记录，不能因字段缺失而自动获得信任。
    return {
      id: item.id,
      source: item.source,
      revision: item.revision,
      trusted: 'trusted' in item && item.trusted === true,
    }
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
