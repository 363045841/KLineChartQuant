import {
  AGENT_IPC_PAYLOAD_VERSION,
  AGENT_IPC_PROTOCOL_VERSION,
  type AgentApplicationApi,
} from '@363045841yyt/klinechart-agent-runtime'
import { describe, expect, it, vi } from 'vitest'

import { AgentIpcRouter, type AgentIpcSenderContext } from '../agent-ipc-router'

function api(): AgentApplicationApi {
  return {
    listSessions: vi.fn<AgentApplicationApi['listSessions']>(async () => [
      { id: 'session-1', title: 'One', updatedAt: 1 },
    ]),
    openSession: vi.fn<AgentApplicationApi['openSession']>(async (sessionId) => ({
      session: { id: sessionId, title: 'One', updatedAt: 1 },
      messages: [],
      toolCalls: [],
      runs: [],
      lastSequence: 0,
    })),
    getProviderStatus: vi.fn<AgentApplicationApi['getProviderStatus']>(async () => ({
      state: 'connected',
      providerLabel: 'Faux',
    })),
    createSession: vi.fn<AgentApplicationApi['createSession']>(async () => ({
      id: 'session-2',
      title: 'New',
      updatedAt: 2,
    })),
    renameSession: vi.fn<AgentApplicationApi['renameSession']>(async () => undefined),
    deleteSession: vi.fn<AgentApplicationApi['deleteSession']>(async () => undefined),
    startRun: vi.fn<AgentApplicationApi['startRun']>(async () => ({ runId: 'run-1' })),
    cancelRun: vi.fn<AgentApplicationApi['cancelRun']>(async () => undefined),
    retryRun: vi.fn<AgentApplicationApi['retryRun']>(async () => ({ runId: 'run-2' })),
    confirmTool: vi.fn<AgentApplicationApi['confirmTool']>(async () => undefined),
    undoTurn: vi.fn<AgentApplicationApi['undoTurn']>(async () => undefined),
    testProvider: vi.fn<AgentApplicationApi['testProvider']>(async (input) => ({
      compatible: true,
      model: input.model,
      latencyMs: 1,
    })),
    deleteProviderCredential: vi.fn<AgentApplicationApi['deleteProviderCredential']>(
      async () => undefined,
    ),
    subscribe: vi.fn<AgentApplicationApi['subscribe']>(() => () => undefined),
  }
}

const sender: AgentIpcSenderContext = {
  senderId: 'web-contents-1',
  windowId: '1',
  chartId: 'primary',
  isMainFrame: true,
}

let nextRequest = 0
function request(command: string, payload: object, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: AGENT_IPC_PROTOCOL_VERSION,
    payloadVersion: AGENT_IPC_PAYLOAD_VERSION,
    windowId: '1',
    chartId: 'primary',
    requestId: `request-${++nextRequest}`,
    deadlineAt: 2_000,
    command,
    payload,
    ...overrides,
  }
}

describe('AgentIpcRouter', () => {
  it('checks sender, strict schema, protocol, deadline, and ownership before dispatch', async () => {
    const application = api()
    const router = new AgentIpcRouter({ application, now: () => 1_000 })
    expect(
      await router.route(request('session.list', {}), { ...sender, isMainFrame: false }),
    ).toMatchObject({ ok: false, error: { code: 'TARGET_MISMATCH' } })
    expect(await router.route(request('session.list', {}, { forged: true }), sender)).toMatchObject(
      { ok: false, error: { code: 'INVALID_PAYLOAD' } },
    )
    expect(
      await router.route(request('session.list', {}, { protocolVersion: 99 }), sender),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PROTOCOL' } })
    expect(
      await router.route(request('session.list', {}, { deadlineAt: 999 }), sender),
    ).toMatchObject({ ok: false, error: { code: 'DEADLINE_EXCEEDED' } })
    expect(
      await router.route(
        request('run.start', { sessionId: 'unknown', prompt: 'x', readOnly: true }),
        sender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'TARGET_MISMATCH' } })
    expect(application.startRun).not.toHaveBeenCalled()
  })

  it('claims listed sessions and routes owned run commands', async () => {
    const application = api()
    const router = new AgentIpcRouter({ application, now: () => 1_000 })
    expect(await router.route(request('session.list', {}), sender)).toMatchObject({ ok: true })
    expect(
      await router.route(
        request('run.start', { sessionId: 'session-1', prompt: 'Inspect', readOnly: true }),
        sender,
      ),
    ).toEqual({ ok: true, value: { runId: 'run-1' } })
    expect(await router.route(request('run.cancel', { runId: 'run-1' }), sender)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(application.cancelRun).toHaveBeenCalledWith('run-1')
  })

  it('deduplicates identical requests and rejects conflicting reuse without storing plaintext keys', async () => {
    const application = api()
    const router = new AgentIpcRouter({ application, now: () => 1_000 })
    const original = request('provider.test', {
      baseUrl: 'https://example.invalid',
      apiKey: 'temporary-secret',
      model: 'fast',
    })
    expect(await router.route(original, sender)).toMatchObject({ ok: true })
    expect(await router.route(structuredClone(original), sender)).toMatchObject({ ok: true })
    expect(application.testProvider).toHaveBeenCalledTimes(1)
    const conflicting = { ...original, payload: { ...original.payload, model: 'other' } }
    expect(await router.route(conflicting, sender)).toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_REQUEST' },
    })
  })

  it('releases ownership when the port or Renderer closes', async () => {
    const application = api()
    const router = new AgentIpcRouter({ application, now: () => 1_000 })
    await router.route(request('session.list', {}), sender)
    router.release(sender.senderId)
    expect(
      await router.route(
        request('run.start', { sessionId: 'session-1', prompt: 'Inspect', readOnly: true }),
        sender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'TARGET_MISMATCH' } })
  })
})
