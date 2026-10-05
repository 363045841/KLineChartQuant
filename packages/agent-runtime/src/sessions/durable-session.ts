// 本文件定义 pi-durable 中的应用会话身份与分页扫描。
import { type ConversationId, type Cursor, defineDoc, type Page } from '@earendil-works/pi-durable'

type SessionIdentity = {
  sessionId: string
  lane: string
  title: string
  deleted: boolean
}

export const SESSION_LANE = { main: 'main', retryPrefix: 'retry:' } as const
export const SESSION_ENTRY = { message: 'kq.message', boundary: 'kq.run.boundary' } as const
export const SESSION_SCAN_PAGE_SIZE = 100

export const SessionIdentityDoc = defineDoc({
  kind: 'kq.session.identity',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  // 每条 Conversation 显式记录所属应用会话与运行分支。
  initial: (): SessionIdentity => ({ sessionId: '', lane: '', title: '', deleted: false }),
})

export interface SessionLane {
  conversationId: ConversationId
  sessionId: string
  lane: string
  title: string
  deleted: boolean
}

// 完整消费官方分页游标，避免会话或历史超过单页时被截断。
export async function scanAll<T>(
  scan: (cursor?: Cursor) => Promise<Page<T, Cursor>>,
): Promise<T[]> {
  const items: T[] = []
  let cursor: Cursor | undefined
  do {
    const page = await scan(cursor)
    items.push(...page.items)
    cursor = page.next
  } while (cursor)
  return items
}
