// 覆盖 AgentApplicationService 的会话管理、Provider 未安装路径与宿主停机中断路径。
import { InMemorySessionRepo } from '@earendil-works/pi-agent-core'
import { describe, expect, it, vi } from 'vitest'

import {
  AgentApplicationService,
  AgentRuntimeError,
  RuntimeSessionService,
  type AgentRunUiEventInput,
  type AgentUiEvent,
  type PiRunPlan,
  type PiRunResult,
  type RunDriver,
} from '../index'

/** 一个可外部驱动完成/中止的最小 RunDriver，用于观察 run 生命周期。 */
class ControlledDriver implements RunDriver {
  aborted = false
  private resolve!: (result: PiRunResult) => void
  private reject!: (error: unknown) => void

  run(): Promise<PiRunResult> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
  abort(): void {
    this.aborted = true
    this.reject(new AgentRuntimeError('ABORTED', 'cancelled'))
  }
  async waitForIdle(): Promise<void> {}
  async push(_event: AgentRunUiEventInput): Promise<void> {}
  complete(): void {
    this.resolve({ text: 'done', completedToolCount: 0, citations: [] })
  }
}

function fixture(options: { withProvider?: boolean } = {}) {
  let id = 0
  let now = 1_000
  const drivers: ControlledDriver[] = []
  const events: AgentUiEvent[] = []
  const sessions = new RuntimeSessionService({
    repository: new InMemorySessionRepo(),
    id: () => `session-${++id}`,
    now: () => ++now,
  })
  const service = new AgentApplicationService({
    sessions,
    id: () => `runtime-${++id}`,
    now: () => ++now,
    createDriver: () => {
      const driver = new ControlledDriver()
      drivers.push(driver)
      return driver
    },
    createPlan: (context) =>
      ({ sessionId: context.sessionId, runId: context.runId }) as PiRunPlan,
    ...(options.withProvider
      ? {
          provider: {
            getStatus: () => ({ state: 'connected' as const, providerLabel: 'Faux' }),
            listModels: vi.fn(async () => ({
              models: [{ id: 'fast', name: 'Fast', compatibility: 'unknown' as const }],
              refreshedAt: 7,
            })),
            test: async () => ({ compatible: true, model: 'fast', latencyMs: 1, stages: [] }),
            deleteCredential: async () => undefined,
          },
        }
      : {}),
  })
  service.subscribe((event) => events.push(event))
  return { service, sessions, drivers, events }
}

async function tick() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('AgentApplicationService session management', () => {
  it('lists and opens sessions through the session service', async () => {
    const { service } = fixture()
    const created = await service.createSession()
    expect(await service.listSessions()).toEqual([created])
    expect(await service.openSession(created.id)).toMatchObject({
      session: created,
      messages: [],
      runs: [],
    })
  })

  it('emits sessions.changed on create, rename and delete', async () => {
    const { service, events } = fixture()
    const created = await service.createSession()
    await service.renameSession(created.id, 'Momentum branch')
    await service.deleteSession(created.id)

    const changes = events.filter((event) => event.type === 'sessions.changed')
    expect(changes).toHaveLength(3)
    expect(changes[1]).toMatchObject({ sessions: [{ id: created.id, title: 'Momentum branch' }] })
    expect(changes[2]).toMatchObject({ sessions: [] })
    expect(changes.map((event) => event.sequence)).toEqual([1, 2, 3])
  })

  it('refuses to delete a session that still owns an active run', async () => {
    const { service } = fixture()
    const session = await service.createSession()
    await service.startRun({ sessionId: session.id, prompt: 'Inspect RSI', readOnly: true })
    await tick()

    await expect(service.deleteSession(session.id)).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
    expect(await service.listSessions()).toHaveLength(1)
  })

  it('reports the default not-configured status when no Provider adapter is installed', async () => {
    const { service } = fixture()
    expect(await service.getProviderStatus()).toEqual({
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: false,
      compatibility: 'unknown',
    })
  })
})

describe('AgentApplicationService provider surface', () => {
  it('rejects testProvider and listProviderModels without an adapter', async () => {
    const { service } = fixture()
    await expect(
      service.testProvider({
        baseUrl: 'https://example.invalid',
        apiKey: 'ephemeral',
        model: 'fast',
        protocol: 'openai-responses',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    await expect(
      service.listProviderModels({
        baseUrl: 'https://example.invalid',
        protocol: 'openai-responses',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
  })

  it('returns the adapter catalog and republishes status afterwards', async () => {
    const { service, events } = fixture({ withProvider: true })
    await expect(
      service.listProviderModels({
        baseUrl: 'https://example.invalid',
        protocol: 'openai-responses',
      }),
    ).resolves.toEqual({
      models: [{ id: 'fast', name: 'Fast', compatibility: 'unknown' }],
      refreshedAt: 7,
    })
    expect(events.at(-1)).toMatchObject({
      type: 'provider.status.changed',
      status: { state: 'connected', providerLabel: 'Faux' },
    })
  })

  it('tolerates a missing adapter when deleting the credential', async () => {
    const { service, events } = fixture()
    await expect(service.deleteProviderCredential()).resolves.toBeUndefined()
    expect(events.at(-1)).toMatchObject({
      type: 'provider.status.changed',
      status: { state: 'not-configured' },
    })
  })
})

describe('AgentApplicationService confirmation and undo stubs', () => {
  it('reports that nothing is pending rather than silently succeeding', async () => {
    const { service } = fixture()
    await expect(service.confirmTool()).rejects.toMatchObject({
      code: 'RUN_NOT_ACTIVE',
      message: 'No tool confirmation is pending.',
    })
    await expect(service.undoTurn()).rejects.toMatchObject({
      code: 'RUN_NOT_ACTIVE',
      message: 'No reversible runtime tool result is available.',
    })
  })
})

describe('AgentApplicationService host shutdown', () => {
  it('aborts every owned run and waits for each to settle', async () => {
    const { service, drivers } = fixture()
    const first = await service.createSession()
    const second = await service.createSession()
    await service.startRun({ sessionId: first.id, prompt: 'Inspect RSI', readOnly: true })
    await service.startRun({ sessionId: second.id, prompt: 'Compare MACD', readOnly: true })
    await tick()
    expect(drivers).toHaveLength(2)

    await service.interruptOwnedRuns()

    expect(drivers.map((driver) => driver.aborted)).toEqual([true, true])
    // 中断完成后，会话必须重新可删除，说明 active 记录确实被清理了。
    await expect(service.deleteSession(first.id)).resolves.toBeUndefined()
  })

  it('is a no-op when no run is owned', async () => {
    const { service, drivers } = fixture()
    await expect(service.interruptOwnedRuns()).resolves.toBeUndefined()
    expect(drivers).toEqual([])
  })

  it('unsubscribes a listener so it stops receiving events', async () => {
    const { service } = fixture()
    const received: AgentUiEvent[] = []
    const unsubscribe = service.subscribe((event) => received.push(event))
    await service.createSession()
    expect(received).toHaveLength(1)
    unsubscribe()
    await service.createSession()
    expect(received).toHaveLength(1)
  })
})
