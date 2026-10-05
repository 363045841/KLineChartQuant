// 本文件使用官方 faux Provider 验证 Harness 执行、分支切换与后续上下文。

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxThinking,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import { describe, expect, it } from 'vitest'
import { AgentApplicationService } from '../application/agent-application-service'
import { createMemoryRuntimeSessions } from '../testing/memory-sessions'

describe('official durable execution', () => {
  it('cancels the official generation and retains its committed partial text', async () => {
    const runtime = await createMemoryRuntimeSessions()
    const faux = fauxProvider({ tokensPerSecond: 40, tokenSize: { min: 1, max: 1 } })
    faux.setResponses([
      fauxAssistantMessage('Streaming answer that should be interrupted before the end.'),
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
    let stop = () => {}
    const partial = new Promise<void>((resolve) => {
      stop = app.subscribe((event) => {
        if (
          event.type === 'session.snapshot' &&
          event.snapshot.messages.some(
            (message) =>
              message.role === 'assistant' &&
              message.status === 'streaming' &&
              message.content.length > 0,
          )
        )
          resolve()
      })
    })
    try {
      const session = await app.createSession()
      const run = await app.startRun({ sessionId: session.id, prompt: 'Start', readOnly: true })
      await partial
      await expect(app.editMessage(run.runId, 'Edited while running')).rejects.toMatchObject({
        code: 'RUN_ACTIVE',
      })
      await app.cancelRun(run.runId)
      const snapshot = await app.openSession(session.id)
      expect(snapshot.runs.at(-1)?.status).toBe('cancelled')
      const answer = snapshot.messages.find((message) => message.role === 'assistant')?.content
      expect(answer?.length).toBeGreaterThan(0)
      expect(answer).not.toBe('Streaming answer that should be interrupted before the end.')
    } finally {
      stop()
      await app.close()
      await runtime.close()
    }
  })

  it('projects official reasoning, live tool progress and durable result details', async () => {
    const runtime = await createMemoryRuntimeSessions()
    const faux = fauxProvider()
    const citation = {
      id: 'source',
      title: 'Source',
      url: 'https://example.com',
      snippet: 'Evidence',
    }
    faux.setResponses([
      fauxAssistantMessage(
        [fauxThinking('分析\n\n完整思考'), fauxToolCall('inspect', {}, { id: 'inspect-call' })],
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage('最终答案\n\n完整尾部'),
      fauxAssistantMessage('Edited result'),
    ])
    const models = createModels()
    models.setProvider(faux.provider)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let sawProgress = () => {}
    const progress = new Promise<void>((resolve) => {
      sawProgress = resolve
    })
    const app = new AgentApplicationService({
      sessions: runtime.sessions,
      createPlan: (context) => ({
        ...context,
        models,
        model: faux.getModel(),
        streamFn: models.streamSimple.bind(models),
        scope: { symbol: null, period: null, readOnly: true },
        tools: [
          {
            name: 'inspect',
            label: '检查图表',
            description: 'Inspect chart',
            parameters: Type.Object({}),
            safety: 'read-only',
            reversible: false,
            executionMode: 'parallel',
            execute: async (_input, toolContext) => {
              toolContext.progress({ label: '正在读取' })
              await gate
              return {
                content: '原始工具结果 sk-abcdefghijklmnop',
                summary: '检查完成',
                evidence: { symbol: 'AAPL', source: 'Native tool' },
                citations: [citation],
              }
            },
          },
        ],
      }),
    })
    const stop = app.subscribe((event) => {
      if (
        event.type === 'session.snapshot' &&
        event.snapshot.toolCalls.some(
          (tool) => tool.status === 'running' && tool.progress?.label === '正在读取',
        )
      )
        sawProgress()
    })
    try {
      const session = await app.createSession()
      const run = await app.startRun({ sessionId: session.id, prompt: 'Inspect', readOnly: true })
      const completed = waitRun(app, run.runId)
      await progress
      release()
      await completed
      await app.close()
      const snapshot = await app.openSession(session.id)
      expect(snapshot.messages.find((message) => message.role === 'reasoning')?.content).toBe(
        '分析\n\n完整思考',
      )
      expect(snapshot.messages.at(-1)).toMatchObject({
        content: '最终答案\n\n完整尾部',
        citations: [citation],
      })
      expect(snapshot.toolCalls[0]).toMatchObject({
        label: '检查图表',
        status: 'succeeded',
        resultContent: '原始工具结果 sk-abcdefghijklmnop',
        resultSummary: '检查完成',
        evidence: { symbol: 'AAPL', source: 'Native tool' },
      })
      const edited = await app.editMessage(run.runId, 'Change the inspection request')
      await waitRun(app, edited.runId)
      const branch = await app.openSession(session.id)
      expect(branch.toolCalls).toEqual([])
      expect(branch.messages.map((message) => message.content)).toEqual([
        'Change the inspection request',
        'Edited result',
      ])
      expect(branch.runs).toEqual([
        expect.objectContaining({ id: edited.runId, editOfRunId: run.runId }),
      ])
    } finally {
      release()
      stop()
      await app.close()
      await runtime.close()
    }
  })

  it('projects only the current branch across repeated forks and continues from the latest answer', async () => {
    const runtime = await createMemoryRuntimeSessions()
    const faux = fauxProvider()
    faux.setResponses(
      [
        'Prefix answer',
        'Original',
        'Later answer',
        'Regenerated',
        'Regenerated again',
        'Edited answer',
        'Edited again',
        'Follow-up',
      ].map((answer) => fauxAssistantMessage(answer)),
    )
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
      const prefix = await app.startRun({
        sessionId: session.id,
        prompt: 'Prefix question',
        readOnly: true,
      })
      await waitRun(app, prefix.runId)
      const first = await app.startRun({
        sessionId: session.id,
        prompt: 'Original question',
        readOnly: true,
      })
      await waitRun(app, first.runId)
      const later = await app.startRun({
        sessionId: session.id,
        prompt: 'Later question',
        readOnly: true,
      })
      await waitRun(app, later.runId)
      const retry = await app.retryRun(first.runId)
      await waitRun(app, retry.runId)
      const repeated = await app.retryRun(retry.runId)
      await waitRun(app, repeated.runId)
      expect(
        (await app.openSession(session.id)).messages.map((message) => message.content),
      ).toEqual(['Prefix question', 'Prefix answer', 'Original question', 'Regenerated again'])
      const selected = (await app.openSession(session.id)).messages.find(
        (message) => message.content === 'Original question',
      )
      expect(selected?.runId).toBe(repeated.runId)
      await expect(app.editMessage(repeated.runId, '  ')).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
      })
      const edited = await app.editMessage(repeated.runId, 'Edited question')
      await waitRun(app, edited.runId)
      const editedAgain = await app.editMessage(edited.runId, 'Edited question again')
      await waitRun(app, editedAgain.runId)
      const snapshot = await app.openSession(session.id)
      expect(snapshot.messages.map((message) => message.content)).toEqual([
        'Prefix question',
        'Prefix answer',
        'Edited question again',
        'Edited again',
      ])
      expect(snapshot.runs.map((run) => run.id)).toEqual([prefix.runId, editedAgain.runId])
      expect((await runtime.sessions.findRun(first.runId)).prompt).toBe('Original question')
      const next = await app.startRun({ sessionId: session.id, prompt: 'Continue', readOnly: true })
      await waitRun(app, next.runId)
      const transcript = await runtime.sessions.getTranscript(
        await runtime.sessions.findRun(next.runId),
      )
      const content = JSON.stringify(transcript)
      expect(content).toContain('Prefix answer')
      expect(content).toContain('Edited question again')
      expect(content).toContain('Edited again')
      expect(content).not.toContain('Regenerated again')
      expect(content).not.toContain('Later answer')
      expect(content).not.toContain('"text":"Original"')
    } finally {
      await app.close()
      await runtime.close()
    }
  })

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
      expect(context.lane).toBe(`fork:${retry.runId}`)
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
      if (event.type !== 'session.snapshot') return
      const run = event.snapshot.runs.find((item) => item.id === runId)
      if (run?.status === 'completed') {
        stop()
        resolve()
      }
      if (run?.status === 'failed') {
        stop()
        reject(new Error(run.error?.message))
      }
    })
  })
}
