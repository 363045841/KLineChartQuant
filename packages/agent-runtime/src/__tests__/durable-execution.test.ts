// 本文件使用官方 faux Provider 验证 Harness 执行、分支切换与后续上下文。

import { createModels, fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { AgentApplicationService } from '../application/agent-application-service'
import { createMemoryRuntimeSessions } from '../testing/memory-sessions'

describe('official durable execution', () => {
  it('continues on the regenerated branch using the new answer', async () => {
    const runtime = await createMemoryRuntimeSessions()
    const faux = fauxProvider()
    faux.setResponses([
      fauxAssistantMessage('Original'),
      fauxAssistantMessage('Regenerated'),
      fauxAssistantMessage('Follow-up'),
    ])
    const models = createModels()
    models.setProvider(faux.provider)
    const app = new AgentApplicationService({
      sessions: runtime.sessions,
      createPlan: (context) => ({
        ...context,
        models,
        model: faux.getModel(),
        streamFn: models.streamSimple.bind(models),
        scope: { symbol: null, period: null, readOnly: true },
        tools: [],
      }),
    })
    try {
      const session = await app.createSession()
      const first = await app.startRun({
        sessionId: session.id,
        prompt: 'Question',
        readOnly: true,
      })
      await waitRun(app, first.runId)
      const retry = await app.retryRun(first.runId)
      await waitRun(app, retry.runId)
      const next = await app.startRun({ sessionId: session.id, prompt: 'Next', readOnly: true })
      await waitRun(app, next.runId)
      const context = await runtime.sessions.findRun(next.runId)
      expect(context.lane).toBe(`retry:${retry.runId}`)
      const transcript = await runtime.sessions.getTranscript(context)
      const answers = transcript
        .filter((message) => message.role === 'assistant')
        .flatMap((message) =>
          typeof message.content === 'string'
            ? [message.content]
            : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])),
        )
      expect(answers).toContain('Regenerated')
      expect(answers).not.toContain('Original')
    } finally {
      await app.close()
      await runtime.close()
    }
  })
})

/** 等待持久化终态事件，不依赖计时睡眠。 */
function waitRun(app: AgentApplicationService, runId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = app.subscribe((event) => {
      if (!('runId' in event) || event.runId !== runId) return
      if (event.type === 'run.completed') {
        stop()
        resolve()
      }
      if (event.type === 'run.failed') {
        stop()
        reject(new Error(event.error.message))
      }
    })
  })
}
