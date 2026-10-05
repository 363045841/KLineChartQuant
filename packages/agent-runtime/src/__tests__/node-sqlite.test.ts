import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { NodeRuntimeSessions } from '../node'

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
const sqliteSupported = major > 22 || (major === 22 && minor >= 19)
const describeSqlite = sqliteSupported ? describe : describe.skip

describeSqlite('Node SQLite runtime sessions', () => {
  let directory: string | undefined
  let runtime: NodeRuntimeSessions | undefined

  afterEach(async () => {
    await runtime?.close()
    runtime = undefined
    if (directory) await rm(directory, { recursive: true, force: true })
    directory = undefined
  })

  it('reopens transcript, title, branch, terminal state, and deletion from a real database', async () => {
    const { createNodeRuntimeSessions } = await import('../node')
    directory = await mkdtemp(join(tmpdir(), 'kq-agent-runtime-'))
    const databasePath = join(directory, 'agent.sqlite')
    let id = 0
    const ids = () => `id-${++id}`
    runtime = await createNodeRuntimeSessions({ databasePath, id: ids })
    const session = await runtime.sessions.create('Durable RSI')
    const first = await runtime.sessions.beginRun({
      sessionId: session.id,
      runId: 'run-1',
      turnId: 'turn-1',
      prompt: 'Inspect RSI',
      context: { items: [{ kind: 'chart-symbol', value: { symbol: 'AAPL', name: 'Apple' } }] },
      readOnly: true,
      startedAt: 1_000,
    })
    await runtime.sessions.finishRun(first, { status: 'completed', endedAt: 1_100 })
    const retry = await runtime.sessions.forkRun({
      kind: 'retry',
      sessionId: session.id,
      originalRunId: first.runId,
      runId: 'run-2',
      turnId: 'turn-2',
      startedAt: 1_200,
    })
    await runtime.sessions.finishRun(retry, { status: 'cancelled', endedAt: 1_300 })
    await runtime.close()
    runtime = undefined

    runtime = await createNodeRuntimeSessions({ databasePath, id: ids })
    expect(await runtime.sessions.list()).toEqual([
      expect.objectContaining({ id: session.id, title: 'Durable RSI' }),
    ])
    expect((await runtime.sessions.findRun('run-2')).retryOfRunId).toBe('run-1')
    expect((await runtime.sessions.findRun('run-2')).context).toEqual(first.context)
    expect((await runtime.sessions.open(session.id)).runs).toEqual([
      expect.objectContaining({ id: 'run-2', status: 'cancelled' }),
    ])

    await runtime.sessions.delete(session.id)
    await runtime.close()
    runtime = undefined
    runtime = await createNodeRuntimeSessions({ databasePath, id: ids })
    expect(await runtime.sessions.list()).toEqual([])
  })

  it('does not persist registered secret values in the SQLite bytes', async () => {
    const { createNodeRuntimeSessions } = await import('../node')
    directory = await mkdtemp(join(tmpdir(), 'kq-agent-runtime-redaction-'))
    const databasePath = join(directory, 'agent.sqlite')
    const secret = 'sqlite-secret-sentinel'
    runtime = await createNodeRuntimeSessions({
      databasePath,
      id: () => 'redacted-session',
      redaction: { secretValues: [secret] },
    })
    const session = await runtime.sessions.create()
    await runtime.sessions.beginRun({
      sessionId: session.id,
      runId: 'run-secret',
      turnId: 'turn-secret',
      prompt: `Inspect ${secret}`,
      readOnly: true,
      startedAt: 1,
    })
    await runtime.close()
    runtime = undefined

    expect((await readFile(databasePath)).includes(Buffer.from(secret))).toBe(false)
  })
})
