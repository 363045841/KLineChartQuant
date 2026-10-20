/** 在真实 Node 线程中验证发布产物；桥接 Web Worker 的消息 API，不替换计算逻辑。 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Worker as NodeWorker } from 'node:worker_threads'
import { createScriptWorker } from '../dist/worker/index.js'

/** 为真实线程补齐浏览器消息 API，使同一份 Worker 产物可在 Node 中执行。 */
class WebWorker extends EventTarget {
  /** 启动实际的发布入口，初始化异常由线程 error 事件上报。 */
  constructor(url, disableWasm = false) {
    super()
    this.thread = new NodeWorker(
      `
      const { parentPort, workerData } = require('node:worker_threads')
      globalThis.postMessage = (message) => parentPort.postMessage(message)
      if (workerData.disableWasm) globalThis.WebAssembly = undefined
      import(workerData.url).then(() => {
        parentPort.on('message', (data) => globalThis.onmessage({ data }))
      })
    `,
      { eval: true, workerData: { url: url.href, disableWasm: disableWasm === true } },
    )
    this.thread.on('message', (data) => this.dispatchEvent(new MessageEvent('message', { data })))
    this.thread.on('error', (error) => {
      this.dispatchEvent(Object.assign(new Event('error'), { message: error.message }))
    })
    this.thread.on('messageerror', () => this.dispatchEvent(new Event('messageerror')))
  }

  /** 消息经过真实的结构化克隆。 */
  postMessage(message) {
    this.thread.postMessage(message)
  }

  /** 释放实际的计算线程。 */
  terminate() {
    void this.thread.terminate()
  }
}

globalThis.Worker = WebWorker
for (const trusted of [false, true]) {
  test(`console 日志经过真实线程传回，异常前输出不丢失（trusted=${trusted}）`, {
    timeout: 15000,
  }, async (context) => {
    const batches = []
    const client = createScriptWorker(undefined, (id, events) => batches.push({ id, events }))
    context.after(() => client.dispose())
    await client.prepare(
      'console',
      `defineIndicator({ name: 'Console', position: 'main', onBar() {
      console.log('close', close[0]); throw new Error('console failure')
    } })`,
      [],
      trusted,
    )
    await assert.rejects(client.run('console', bars), /console failure/)
    assert.equal(batches.length, 1)
    assert.equal(batches[0].id, 'console')
    assert.equal(batches[0].events[0].message, 'close 1')
    assert.equal(batches[0].events[0].barIndex, 0)
    assert.equal(batches[0].events[1].level, 'error')
  })
}
const source = await readFile(new URL('sma.ts', import.meta.url), 'utf8')
const bars = Array.from({ length: 12 }, (_, index) => ({
  time: index,
  open: index + 1,
  high: index + 1,
  low: index + 1,
  close: index + 1,
  volume: 1,
}))

test('原生后端在 WebAssembly 不可用时仍可独立准备和计算', { timeout: 15000 }, async (context) => {
  const client = createScriptWorker(
    new WebWorker(new URL('../dist/worker/impl/script.worker.js', import.meta.url), true),
  )
  context.after(() => client.dispose())
  await client.prepare('native-only', source, [], true)
  const result = await client.run('native-only', bars, { period: 2 })
  assert.equal(result.plots[0].data.length, bars.length)
  assert.ok(result.plots[0].data.some((point) => Number.isFinite(point?.value)))
})

test('信任属性选择原生引擎，切换回 QuickJS，并保持编译失败前的快照', {
  timeout: 15000,
}, async (context) => {
  const client = createScriptWorker()
  context.after(() => client.dispose())
  // WebAssembly 是宿主原生能力，QuickJS 内没有；用输出证明选路而不模拟执行器。
  const engineSource = `defineIndicator({ name: 'Engine', position: 'main', onBar() { plot.Line(typeof WebAssembly === 'object' ? 1 : 0, 'native') } })`
  const [definition, output] = await Promise.all([
    client.prepare('engine', engineSource, [], true),
    client.run('engine', bars),
  ])
  assert.equal(definition.name, 'Engine')
  assert.equal(output.plots[0].data[0].value, 1)
  await assert.rejects(client.prepare('engine', 'export const n = 1', [], true), {
    code: 'SCRIPT_COMPILE_FAILED',
  })
  assert.equal((await client.run('engine', bars)).plots[0].data[0].value, 1)
  await client.prepare('engine', engineSource, [], false)
  assert.equal((await client.run('engine', bars)).plots[0].data[0].value, 0)
  await client.prepare('engine', engineSource, [], true)
  assert.equal((await client.run('engine', bars)).plots[0].data[0].value, 1)
  await client.release('engine')
  await assert.rejects(client.run('engine', bars), /脚本尚未准备/)
})

test('Worker 编译、并发调用、替换和释放使用同一个线程内快照', {
  timeout: 15000,
}, async (context) => {
  const client = createScriptWorker()
  context.after(() => client.dispose())
  // 准备与运行并发发出，验证 WASM 首次加载期间的处理顺序。
  const [definition, first, second] = await Promise.all([
    client.prepare('sma', source),
    client.run('sma', bars),
    client.run('sma', bars.slice(0, 3)),
  ])
  assert.ok(definition.name)
  assert.equal(first.plots[0].data.length, bars.length)
  assert.equal(second.plots[0].data.length, 3)

  const replacement = `defineIndicator({ name: 'Replacement', position: 'main', onBar() { plot.Line(close, 'value') } })`
  assert.equal((await client.prepare('sma', replacement)).name, 'Replacement')
  assert.deepEqual(
    (await client.run('sma', bars)).plots[0].data.map((point) => point?.value),
    bars.map((bar) => bar.close),
  )
  await client.release('sma')
  await assert.rejects(client.run('sma', bars), /脚本尚未准备/)
})

test('脚本诊断跨线程保留，单次失败后线程仍能继续计算', { timeout: 15000 }, async (context) => {
  const client = createScriptWorker()
  context.after(() => client.dispose())
  await assert.rejects(client.prepare('bad', 'export const value = 1'), {
    code: 'SCRIPT_COMPILE_FAILED',
  })
  await client.prepare(
    'bad',
    `defineIndicator({ name: 'BadPlot', position: 'main', onBar() { plot.Line(1 / 0, 'infinite') } })`,
  )
  await assert.rejects(client.run('bad', bars), {
    code: 'SCRIPT_INFINITE_PLOT_VALUE',
    plotName: 'infinite',
    barIndex: 0,
  })
  await client.prepare('sma', source)
  assert.ok((await client.run('sma', bars)).plots.length)
})

test('销毁拒绝待处理与后续调用，并允许重复销毁', async () => {
  const client = createScriptWorker()
  const pending = client.prepare('sma', source)
  client.dispose()
  client.dispose()
  await assert.rejects(pending, /已销毁/)
  await assert.rejects(client.run('sma', bars), /已销毁/)
})

test('线程初始化失败会结束待处理与后续调用', { timeout: 15000 }, async (context) => {
  const client = createScriptWorker(
    new WebWorker(new URL('../dist/missing-worker.js', import.meta.url)),
  )
  context.after(() => client.dispose())
  await assert.rejects(client.prepare('sma', source), /Cannot find module/)
  await assert.rejects(client.run('sma', bars), /Cannot find module/)
})
