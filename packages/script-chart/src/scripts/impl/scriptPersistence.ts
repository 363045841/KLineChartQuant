/** 用户脚本文档持久化：复用 Core 的 IndexedDB API 保存整份用户工作区。 */
import { createIndexedDbPersistence } from '@363045841yyt/klinechart-core'
import { normalizeFolderPath } from '@363045841yyt/klinechart-plot-contracts'
import type { SavedScript, ScriptFolder, ScriptPersistence, ScriptWorkspace } from '../types.js'

/** 必需的非空标识；空串视为损坏记录。 */
function requireId(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value
}

/** 必需的字符串字段，允许空串（源码与根目录）。 */
function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message)
  return value
}

/** 必需的修订号：必须是 >=1 的整数。 */
function requireRevision(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(message)
  return value
}

/** 单个文件夹记录必须带有效 kind 与路径；根目录由文档自身表达，不能作为记录出现。 */
function decodeFolder(value: unknown): ScriptFolder {
  if (typeof value !== 'object' || value === null) throw new Error('用户脚本文件夹格式错误')
  const record = value as Record<string, unknown>
  if (record.kind !== 'indicator' && record.kind !== 'library')
    throw new Error('用户脚本文件夹类型错误')
  const path = normalizeFolderPath(requireString(record.path, '用户脚本文件夹路径格式错误'))
  if (path === '') throw new Error('用户脚本文件夹路径格式错误')
  return { kind: record.kind, path }
}

/** 单个脚本文档的边界校验，损坏的数据不能被空列表覆盖。 */
function decodeScript(value: unknown): SavedScript {
  if (typeof value !== 'object' || value === null) throw new Error('用户脚本文档格式错误')
  const record = value as Record<string, unknown>
  if (typeof record.trusted !== 'boolean') throw new Error('用户脚本信任状态格式错误')
  return {
    id: requireId(record.id, '用户脚本文档格式错误'),
    source: requireString(record.source, '用户脚本文档格式错误'),
    revision: requireRevision(record.revision, '用户脚本文档格式错误'),
    trusted: record.trusted,
    folder: normalizeFolderPath(requireString(record.folder, '用户脚本文档格式错误')),
  }
}

/** 读取完整工作区；任何字段缺失或类型不符都判定为格式错误。 */
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
