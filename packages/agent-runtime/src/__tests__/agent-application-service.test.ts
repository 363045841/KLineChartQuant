// 验证宿主只广播完整会话状态，配置失败与配置阶段取消不会遗漏终态。
import { describe, expect, it } from 'vitest'
import { AgentApplicationService } from '../application/agent-application-service'
import { AgentRuntimeError } from '../contracts/errors'
import type { AgentUiEvent } from '../contracts/ui'
import { createMemoryRuntimeSessions } from '../testing/memory-sessions'

describe('AgentApplicationService', () => {
  it('publishes a complete failed snapshot when Provider configuration fails', async () => {
    const runtime = await createMemoryRuntimeSessions()
    const app = new AgentApplicationService({
      sessions: runtime.sessions,
      createPlan: () => {
        throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'Configure a Provider.')
      },
    })
    const events: AgentUiEvent[] = []
    try {
      const session = await app.createSession()
      const terminal = new Promise<void>((resolve) =>
        app.subscribe((event) => {
          events.push(event)
          if (event.type === 'session.snapshot' && event.snapshot.runs.at(-1)?.status === 'failed')
            resolve()
        }),
      )
      await app.startRun({ sessionId: session.id, prompt: 'Hello', readOnly: true })
      await terminal
      await app.close()
      expect(events.every((event) => event.type === 'session.snapshot')).toBe(true)
      const snapshot = await app.openSession(session.id)
      expect(snapshot.runs[0]).toMatchObject({
        status: 'failed',
        error: { code: 'PROVIDER_NOT_CONFIGURED' },
      })
      expect(snapshot.messages).toEqual([])
    } finally {
      await app.close()
      await runtime.close()
    }
  })

  it('rejects parallel inputs while preparation is pending and cancels without submitting', async () => {
    const runtime = await createMemoryRuntimeSessions()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const app = new AgentApplicationService({
      sessions: runtime.sessions,
      createPlan: async () => {
        await gate
        throw new AgentRuntimeError('ABORTED', 'Cancelled during preparation.')
      },
    })
    try {
      const session = await app.createSession()
      const firstStart = app.startRun({ sessionId: session.id, prompt: 'First', readOnly: true })
      await expect(
        app.startRun({ sessionId: session.id, prompt: 'Second', readOnly: true }),
      ).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
      const first = await firstStart
      const cancelled = app.cancelRun(first.runId)
      release()
      await cancelled
      expect((await app.openSession(session.id)).runs[0]?.status).toBe('cancelled')
    } finally {
      release()
      await app.close()
      await runtime.close()
    }
  })
})
