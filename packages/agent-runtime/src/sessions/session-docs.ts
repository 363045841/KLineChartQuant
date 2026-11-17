// KQ 会话文档：Pi 不维护会话标题与最近活动时间，这两项作为会话文档由官方持久化。
import { defineDoc, type JsonObject } from '@earendil-works/pi-durable'

/** 会话目录元数据；fork 会复制当前值，使分支继承标题与时间。 */
export type KqSessionDocState = {
  title: string
  updatedAt: number
}

export const KqSessionDoc = defineDoc<KqSessionDocState>({
  kind: 'kq.session',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'current',
  initial: () => ({ title: '', updatedAt: 0 }),
  // 文档只有两个标量字段，每次写入直接落完整快照，不做增量。
  checkpointWhen: () => true,
})

/** 判断 JSON 对象，供读取官方文档使用。 */
function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 从官方会话视图的文档表中读取 KQ 会话文档。
 * @param docs 官方视图的内置文档表。
 * @returns 合法会话文档；缺失或格式不符时返回 undefined。
 */
export function readSessionDoc(
  docs: Readonly<Record<string, JsonObject>>,
): KqSessionDocState | undefined {
  const value = docs[KqSessionDoc.definition.kind]
  if (!isObject(value)) return undefined
  if (typeof value.title !== 'string' || typeof value.updatedAt !== 'number') return undefined
  return { title: value.title, updatedAt: value.updatedAt }
}
