/** 用户脚本文档持久化：复用 Core 的 IndexedDB API 保存整份用户工作区。 */
import { createIndexedDbPersistence } from '@363045841yyt/klinechart-core'
import type { SavedScript, ScriptFolder, ScriptPersistence, ScriptWorkspace } from '../types.js'
import { normalizeFolderPath } from './folderPath.js'

/** 单个文件夹记录必须带有效 kind 与路径。 */
function decodeFolder(value: unknown): ScriptFolder {
  if (typeof value !== 'object' || value === null) throw new Error('用户脚本文件夹格式错误')
  if (!('kind' in value) || (value.kind !== 'indicator' && value.kind !== 'library')) {
    throw new Error('用户脚本文件夹类型错误')
  }
  return {
    kind: value.kind,
    path: normalizeFolderPath('path' in value && typeof value.path === 'string' ? value.path : ''),
  }
}

/** 单个脚本文档的边界校验，损坏的数据不能被空列表覆盖。 */
function decodeScript(value: unknown): SavedScript {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    !('source' in value) ||
    typeof value.source !== 'string' ||
    !('revision' in value) ||
    typeof value.revision !== 'number' ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    !('folder' in value) ||
    typeof value.folder !== 'string'
  )
    throw new Error('用户脚本文档格式错误')
  if (!('trusted' in value) || typeof value.trusted !== 'boolean') {
    throw new Error('用户脚本信任状态格式错误')
  }
  return {
    id: value.id,
    source: value.source,
    revision: value.revision,
    trusted: value.trusted,
    folder: value.folder === '' ? '' : normalizeFolderPath(value.folder),
  }
}

/** 读取完整工作区；旧版本的数组结构不属于当前契约，直接判定为错误格式。 */
function decode(value: unknown): ScriptWorkspace {
  if (typeof value !== 'object' || value === null) throw new Error('用户脚本存储格式错误')
  if (!('scripts' in value) || !Array.isArray(value.scripts))
    throw new Error('用户脚本存储格式错误')
  if (!('folders' in value) || !Array.isArray(value.folders))
    throw new Error('用户脚本存储格式错误')
  return {
    scripts: value.scripts.map(decodeScript),
    folders: value.folders.map(decodeFolder),
  }
}

/** 创建工作区隔离的用户脚本存储，显式保存直接等待事务完成。 */
export function createScriptPersistence(): ScriptPersistence {
  return createIndexedDbPersistence<ScriptWorkspace>({
    databaseName: '@363045841yyt/klinechart-user-scripts-v2',
    storeName: 'scripts',
    key: 'documents',
    codec: { decode, encode: (value) => value },
    flushOnPageHide: false,
    strictLoad: true,
  })
}
