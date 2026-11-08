/**
 * 主进程侧的窗口工作区清单。
 *
 * 只记录“要恢复哪几个工作区”，标签内容由渲染进程按工作区身份自行持有；
 * 主进程不复制标签数据，避免出现第二份真相。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const WORKSPACE_FILE_NAME = 'window-workspaces.json'
const WORKSPACE_FILE_VERSION = 1

interface WorkspaceRecord {
  readonly version: typeof WORKSPACE_FILE_VERSION
  readonly workspaceIds: ReadonlyArray<string>
}

/** 判断落盘记录是否为当前版本且字段完整。 */
function isWorkspaceRecord(value: unknown): value is WorkspaceRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.version === WORKSPACE_FILE_VERSION &&
    Array.isArray(record.workspaceIds) &&
    record.workspaceIds.every((id) => typeof id === 'string' && id.length > 0)
  )
}

/**
 * 读取要恢复的工作区身份。
 *
 * @param userDataPath 用户数据目录
 * @returns 工作区身份列表；文件缺失或损坏时为空列表（等同于“没有上次会话”）
 */
export async function loadWorkspaceIds(userDataPath: string): Promise<ReadonlyArray<string>> {
  try {
    const raw = await readFile(join(userDataPath, WORKSPACE_FILE_NAME), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return isWorkspaceRecord(parsed) ? parsed.workspaceIds : []
  } catch {
    return []
  }
}

/**
 * 原子写入当前存活的工作区身份。
 *
 * @param userDataPath 用户数据目录
 * @param workspaceIds 存活工作区身份
 */
export async function saveWorkspaceIds(
  userDataPath: string,
  workspaceIds: ReadonlyArray<string>,
): Promise<void> {
  const path = join(userDataPath, WORKSPACE_FILE_NAME)
  const record: WorkspaceRecord = { version: WORKSPACE_FILE_VERSION, workspaceIds }
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, JSON.stringify(record), 'utf8')
  try {
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
