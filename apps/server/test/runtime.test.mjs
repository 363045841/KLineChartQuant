/** Node 产物验收：延迟探测、CRLF 实时帧、真实 Worker 与 SQLite 重启。 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { composeRoot } from '../dist/compose/root.js'
import { createEventStream } from '../dist/node/eventStream.js'
import { createSqliteDriver } from '../dist/node/sqliteDriver.js'

test('restores a rule before the source is ready and persists one real worker result', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kline-server-'))
  const databasePath = join(directory, 'state.db')
  const capabilities = { instrumentTypes: ['stock'], bars: { periods: ['daily'], adjustments: ['none'] }, liveBars: true }
  const id = 'gotdx:stock:1:600519'
  const instrument = { id, source: 'gotdx', symbol: '600519', name: '600519', instrumentType: 'stock', exchange: 'SH', sessionId: 'CN', capabilities }
  const rule = { id: 'rule', name: 'Rule', script: { definitionId: 'test-alert', inputs: {} }, symbol: { instrument, period: 'daily', adjust: 'none' }, enabled: true, channels: ['in-app'], message: '{{message}}', createdAt: 0 }
  const script = { id: 'test-alert', source: "defineAlert({version:2,name:'TestAlert',frequency:'once',onBar(){alert('fired')}})", trusted: false, revision: 1, folder: '' }
  const gate = Promise.withResolvers()
  const streamed = Promise.withResolvers()
  const seed = createSqliteDriver({ filename: databasePath })
  await seed.transaction(['alerts'], 'readwrite', (tx) => tx.put('alerts', { version: 1, alerts: [rule], fires: [] }, 'state'))
  await seed.dispose()
  await writeFile(join(directory, 'workspace.json'), JSON.stringify({ scripts: [script], folders: [] }))

  const bar = { timestamp: 1767605400000, open: 1, high: 2, low: 1, close: 1 }
  const probes = []
  const errors = []
  const fetchImpl = async (input) => {
    const path = new URL(input).pathname
    if (path.endsWith('/probe')) {
      probes.push(path.split('/').at(-2))
      await gate.promise
      return Response.json({ data: { status: 'online', checkedAt: Date.now(), capabilities } })
    }
    if (path.endsWith('/bars')) {
      return Response.json({ data: { instrumentId: id, period: 'daily', adjustment: 'none', barAggregation: 'original', timezone: 'Asia/Shanghai', items: [bar], olderData: 'exhausted' } })
    }
    assert.match(path, /\/gotdx\/stream$/)
    const body = new ReadableStream({ start(controller) { streamed.resolve(controller) } })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }
  const open = createEventStream(fetchImpl)
  const config = { port: 8787, databasePath, scriptsDirectory: directory, sources: ['gotdx'], workers: 1 }
  let root
  try {
    root = await composeRoot(config, fetchImpl, open, (error) => errors.push(error))
    assert.equal(root.alerts.alerts.peek().length, 1)
    assert.deepEqual(probes, ['gotdx'])
    gate.resolve()
    const controller = await streamed.promise
    const delivered = Promise.withResolvers()
    const unsubscribe = root.alerts.fires.subscribe(() => delivered.resolve(root.alerts.fires.peek()))
    try {
      const frame = { seq: 1, ts: Date.now(), type: 'bar', state: 'closed', instrumentId: id, bar: { ...bar, close: 2 } }
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(frame)}\r\n\r\n`))
      const timeout = AbortSignal.timeout(3000)
      const fires = await Promise.race([delivered.promise, new Promise((_, reject) => timeout.addEventListener('abort', () => reject(timeout.reason), { once: true }))])
      assert.deepEqual(fires.map((fire) => fire.message), ['fired'])
    } finally { unsubscribe() }
    await root.dispose()
    root = await composeRoot(config, fetchImpl, open, (error) => errors.push(error))
    assert.equal(root.alerts.list({ status: 'triggered' }).length, 1)
    assert.equal(root.alerts.fires.peek().length, 1)
    assert.deepEqual(errors, [])
  } finally {
    gate.resolve()
    await root?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

test('SQLite isolates key types and enforces transaction scope', async () => {
  const driver = createSqliteDriver({ filename: ':memory:' })
  try {
    await driver.transaction(['alerts'], 'readwrite', async (tx) => {
      await tx.put('alerts', 1, '["key"]')
      await tx.put('alerts', 2, ['key'])
    })
    await driver.transaction(['alerts'], 'readonly', async (tx) => {
      assert.equal(await tx.get('alerts', '["key"]'), 1)
      assert.equal(await tx.get('alerts', ['key']), 2)
    })
    for (const [store, mode] of [['alerts', 'readonly'], ['unlisted', 'readwrite']]) {
      await assert.rejects(driver.transaction(['alerts'], mode, (tx) => tx.put(store, 3, 'key')), /Invalid document transaction/)
    }
  } finally { await driver.dispose() }
})
