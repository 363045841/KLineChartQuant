/**
 * 脚本工作区持久化：单文件 JSON + 原子替换。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ScriptPersistence, ScriptWorkspace } from '@363045841yyt/klinechart-script-chart'

/** 工作区文件名；目录由 `--scripts` 指定。 */
const WORKSPACE_FILE = 'workspace.json'

export interface FileScriptPersistenceOptions {
  readonly directory: string
}

/**
 * 创建文件脚本工作区。
 *
 * @param options - 工作区目录
 * @returns 读写整份工作区的持久化实现
 */
export function createFileScriptPersistence(
  options: FileScriptPersistenceOptions,
): ScriptPersistence {
  const file = join(options.directory, WORKSPACE_FILE)

  return {
    async load() {
      try {
        const text = await readFile(file, 'utf8')
        return JSON.parse(text) as ScriptWorkspace
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    async save(workspace) {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.tmp`
      await writeFile(temporary, JSON.stringify(workspace, null, 2), 'utf8')
      await rename(temporary, file)
      return true
    },
  }
}
