// KQ 会话文档：Pi 不维护会话标题与最近活动时间，这两项作为会话文档由官方持久化。
import { defineDoc } from '@earendil-works/pi-durable'

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
