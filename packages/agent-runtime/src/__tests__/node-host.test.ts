/**
 * Node 宿主装配测试：设置文件持久化，以及跨重启读取同一份设置。
 *
 * 宿主与浏览器版共用同一份实现，这里只验证 Node 侧的装配与存储。
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AGENT_HOST_PROTOCOL_VERSION,
  type AgentClientMessage,
  type AgentHostMessage,
} from '../host/protocol.js'
import {
  createFileAgentSettingsStorage,
  type NodeAgentHost,
  startNodeAgentHost,
} from '../node-host.js'

/** 创建临时目录并在用例结束后删除。 */
async function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'kq-agent-host-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** 接入一个测试页面，按顺序把每次应答交给对应的调用。 */
function attachPage(runtime: NodeAgentHost): {
  ask(message: AgentClientMessage): Promise<AgentHostMessage>
} {
  const pending: Array<(message: AgentHostMessage) => void> = []
  runtime.host.attachClient('test-page', (message) => pending.shift()?.(message))
  return {
    ask(message) {
      return new Promise((resolve) => {
        pending.push(resolve)
        runtime.host.receive('test-page', message)
      })
    },
  }
}

describe('createFileAgentSettingsStorage', () => {
  it('returns null before the first write and reads back the same document', async () => {
    await withTempDir(async (directory) => {
      const storage = createFileAgentSettingsStorage(join(directory, 'settings.json'))
      expect(await storage.read()).toBeNull()

      const document = { version: 3, revision: 1, profiles: [], disabledTools: [] }
      await storage.write(document)

      expect(await storage.read()).toEqual(document)
    })
  })
})

describe('startNodeAgentHost', () => {
  it('keeps the settings document across restarts', async () => {
    await withTempDir(async (directory) => {
      const first = await startNodeAgentHost({ dataDir: directory })
      try {
        const page = attachPage(first)
        await page.ask({
          kind: 'request',
          protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
          id: 'create',
          method: 'provider.profile.create',
          params: { name: 'Gateway' },
        })
      } finally {
        await first.close()
      }

      const second = await startNodeAgentHost({ dataDir: directory })
      try {
        const page = attachPage(second)
        const response = await page.ask({
          kind: 'request',
          protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
          id: 'snapshot',
          method: 'provider.snapshot',
          params: undefined,
        })
        expect(response).toEqual({
          kind: 'response',
          id: 'snapshot',
          ok: true,
          result: expect.objectContaining({
            profiles: [expect.objectContaining({ name: 'Gateway', active: true })],
          }),
        })
      } finally {
        await second.close()
      }
    })
  })
})
