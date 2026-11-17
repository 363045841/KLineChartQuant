// 持久化测试：会话目录与标题在 SQLite 关闭重开后仍由官方存储恢复。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNodeRuntimeSessions } from '../node.js'

describe('SQLite session persistence', () => {
  it('reopens the session catalog and title from storage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kq-agent-sessions-'))
    const databasePath = join(directory, 'sessions.db')
    try {
      const first = await createNodeRuntimeSessions({ databasePath })
      const created = await first.sessions.create('Persistent')
      await first.close()

      const second = await createNodeRuntimeSessions({ databasePath })
      expect(await second.sessions.list()).toEqual([
        { id: created.id, title: 'Persistent', updatedAt: created.updatedAt },
      ])
      await second.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
