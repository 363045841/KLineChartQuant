/** 对最终页面产物的真实语言 Worker 做回归测试，防止源码测试通过而打包带入旧声明。 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'
import { SCRIPT_SOURCE_FILE } from '@363045841yyt/klinechart-script/language'
import { buildScriptEditorPage } from './script-editor-page-plugin.mjs'

const serverRequire = createRequire(new URL('../../script-server/package.json', import.meta.url))
const { wrap, releaseProxy } = serverRequire('comlink')
const nodeEndpoint = serverRequire('comlink/dist/umd/node-adapter.js')

/** 语言 Worker 是独立产物文件，直接按名字取源码，不再从页面脚本里反解字符串。 */
function languageWorkerSource(page) {
  const worker = page.files.find(
    (file) => file.name.endsWith('.js') && /(^|\/)scriptLanguage\.worker-/.test(file.name),
  )
  if (!worker || typeof worker.source !== 'string') {
    throw new Error('独立编辑器产物中没有找到语言 Worker')
  }
  return worker.source
}

/** 在线程中补齐 Comlink 使用的浏览器消息接口，执行未经改写的 Worker 产物。 */
async function startWorker(source) {
  const url = `data:text/javascript;base64,${Buffer.from(`${source}\n//# sourceURL=klinechart-script-language-worker.js`).toString('base64')}`
  const thread = new Worker(
    `
    const { parentPort } = require('node:worker_threads')
    const listeners = new Map()
    // 浏览器构建不包含 Node 内置模块，隐藏 process 以保持 TypeScript 的浏览器分支。
    globalThis.process = undefined
    globalThis.self = globalThis
    globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer)
    globalThis.addEventListener = (type, listener) => {
      if (type !== 'message') return
      const receive = data => listener({ data })
      listeners.set(listener, receive)
      parentPort.on('message', receive)
    }
    globalThis.removeEventListener = (type, listener) => {
      if (type !== 'message') return
      const receive = listeners.get(listener)
      if (receive) parentPort.off('message', receive)
      listeners.delete(listener)
    }
    import(${JSON.stringify(url)}).then(() => parentPort.postMessage({ type: 'test-ready' }))
  `,
    { eval: true },
  )
  try {
    await new Promise((resolve, reject) => {
      thread.once('error', reject)
      thread.once('message', resolve)
    })
    return { thread, worker: wrap(nodeEndpoint(thread)) }
  } catch (error) {
    await thread.terminate()
    throw error
  }
}

test('独立页面的最终 Worker 提供 Series 补全及只读序列类型', { timeout: 30000 }, async () => {
  const page = await buildScriptEditorPage()
  // 独立页面不能依赖主包入口的全局 CSS；检查最终输出的样式资源。
  const css = page.files
    .filter((file) => page.styles.includes(file.name))
    .map((file) => String(file.source))
    .join('\n')
  assert.ok(css.includes('::-webkit-scrollbar-thumb'), '独立页面必须打包项目共享滚动条样式')
  assert.ok(css.includes('--klc-color-axis-text'), '滚动条必须使用共享主题变量')
  const { thread, worker } = await startWorker(languageWorkerSource(page))
  try {
    await worker.initialize()
    const source = 'let source: Ser'
    await worker.updateFile({ path: SCRIPT_SOURCE_FILE, code: source })
    const result = await worker.getAutocompletion({
      path: SCRIPT_SOURCE_FILE,
      context: { pos: source.length, explicit: true },
    })
    assert.ok(
      result?.options.some((option) => option.label === 'Series'),
      '打包后的补全必须包含 Series',
    )

    await worker.updateFile({
      path: SCRIPT_SOURCE_FILE,
      code: `
      function current(source: Series): number { return source.at(0) + source[1] }
      const source: Series = close
      const average: Series = ta.sma(source, 20)
      current(average)
    `,
    })
    assert.deepEqual(
      await worker.getLints({ path: SCRIPT_SOURCE_FILE, diagnosticCodesToIgnore: [] }),
      [],
    )

    await worker.updateFile({
      path: SCRIPT_SOURCE_FILE,
      code: 'const source: Series = close; source[0] = 1',
    })
    const diagnostics = await worker.getLints({
      path: SCRIPT_SOURCE_FILE,
      diagnosticCodesToIgnore: [],
    })
    assert.ok(diagnostics.some((diagnostic) => /read.only/i.test(diagnostic.message)))
  } finally {
    worker[releaseProxy]()
    await thread.terminate()
  }
})
