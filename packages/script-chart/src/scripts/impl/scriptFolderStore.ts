/** 文件夹注册表：只保存非根路径，根目录由文档自身表达。 */
import {
  isWithinFolder,
  normalizeFolderPath,
  parentFolderPath,
} from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptFolder } from '../types.js'

/** 文件夹集合：key 由分组与路径共同决定。 */
export type ScriptFolderMap = Map<string, ScriptFolder>

/** 文件夹唯一键：同一路径在不同分组下互不影响。 */
export function folderKey(kind: ScriptFolder['kind'], path: string): string {
  return `${kind}:${path}`
}

/** 文档只能落在已存在的文件夹中，避免目录树出现悬空路径。 */
export function requireFolder(
  folders: ScriptFolderMap,
  kind: ScriptFolder['kind'],
  path: string,
): string {
  if (path === '') return ''
  const normalized = normalizeFolderPath(path)
  if (!folders.has(folderKey(kind, normalized))) throw new Error(`文件夹不存在：${normalized}`)
  return normalized
}

/** 校验新目录并返回可写入的记录：根目录不落记录、同名拒绝、父目录必须存在。 */
export function nextFolder(folders: ScriptFolderMap, folder: ScriptFolder): ScriptFolder {
  const path = normalizeFolderPath(folder.path)
  if (path === '') throw new Error('根目录已存在')
  if (folders.has(folderKey(folder.kind, path))) throw new Error(`文件夹已存在：${path}`)
  requireFolder(folders, folder.kind, parentFolderPath(path))
  return Object.freeze({ kind: folder.kind, path })
}

/** 删除前定位：根目录与不存在的目录都拒绝。 */
export function removableFolder(
  folders: ScriptFolderMap,
  kind: ScriptFolder['kind'],
  path: string,
): ScriptFolder {
  const normalized = normalizeFolderPath(path)
  if (normalized === '') throw new Error('分组根目录不能删除')
  const record = folders.get(folderKey(kind, normalized))
  if (!record) throw new Error(`文件夹不存在：${normalized}`)
  return record
}

/** 目录子树（含自身）；删除时一次取全。 */
export function foldersWithin(
  folders: ScriptFolderMap,
  kind: ScriptFolder['kind'],
  path: string,
): readonly ScriptFolder[] {
  return [...folders.values()].filter(
    (record) => record.kind === kind && isWithinFolder(record.path, path),
  )
}

/** 从持久化记录恢复：先浅后深，父目录必须已存在。 */
export function restoreFolders(records: readonly ScriptFolder[]): ScriptFolderMap {
  const folders: ScriptFolderMap = new Map()
  const byDepth = [...records].sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  for (const folder of byDepth) {
    const path = normalizeFolderPath(folder.path)
    requireFolder(folders, folder.kind, parentFolderPath(path))
    folders.set(folderKey(folder.kind, path), Object.freeze({ kind: folder.kind, path }))
  }
  return folders
}
