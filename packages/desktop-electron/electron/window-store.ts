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
async function loadWorkspaceIds(userDataPath: string): Promise<ReadonlyArray<string>> {
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
async function saveWorkspaceIds(
  userDataPath: string,
  workspaceIds: ReadonlyArray<string>,
): Promise<void> {
  const path = join(userDataPath, WORKSPACE_FILE_NAME)
  const record: WorkspaceRecord = { version: WORKSPACE_FILE_VERSION, workspaceIds }
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(record), 'utf8')
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

/** 每个应用实例持有一个清单仓库；按调用顺序提交，并在退出前等待队列排空。 */
export function createWorkspaceSessionStore(userDataPath: string) {
  let queue: Promise<void> = Promise.resolve()
  return {
    /** 读取已提交会话；不与本实例尚未完成的写入竞争。 */
    async load(): Promise<ReadonlyArray<string>> {
      await queue
      return loadWorkspaceIds(userDataPath)
    },
    /** 立即捕获快照，失败由调用方处理，后续保存仍能继续。 */
    save(workspaceIds: ReadonlyArray<string>): Promise<void> {
      const snapshot = [...workspaceIds]
      const result = queue.then(() => saveWorkspaceIds(userDataPath, snapshot))
      queue = result.catch(() => {})
      return result
    },
    /** 写入错误已由 save 的调用方接收，这里只等待所有提交结束。 */
    flush: () => queue,
  }
}
