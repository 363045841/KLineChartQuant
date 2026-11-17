// 旧版会话元数据：仅用于把已发布版本写入的会话回填成新的 KQ 会话文档。
import { defineDoc, type EntryRecord } from '@earendil-works/pi-durable'

/** 旧版身份文档形状。 */
export type LegacySessionIdentity = {
  sessionId: string
  lane: string
  title: string
  deleted: boolean
}

/** 旧版主分支标识；`fork:` 前缀的分支会话不进入目录。 */
export const LEGACY_MAIN_LANE = 'main'

/** 旧版最近活动时间记录，由旧实现每次重命名与运行结束时追加。 */
export const LEGACY_SESSION_METADATA_KIND = 'kq.session.metadata'

export const LegacySessionIdentityDoc = defineDoc<LegacySessionIdentity>({
  kind: 'kq.session.identity',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  checkpointWhen: () => false,
  initial: () => ({ sessionId: '', lane: '', title: '', deleted: false }),
})

/** 判断 JSON 对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取旧版最近活动时间 entry 的更新时间。
 * @param entry 旧版元数据 entry。
 * @returns 合法的更新时间；形状不符时返回 undefined。
 */
export function readLegacyUpdatedAt(entry: Pick<EntryRecord, 'kind' | 'data'>): number | undefined {
  if (entry.kind !== LEGACY_SESSION_METADATA_KIND || !isObject(entry.data)) return undefined
  return typeof entry.data.updatedAt === 'number' ? entry.data.updatedAt : undefined
}
