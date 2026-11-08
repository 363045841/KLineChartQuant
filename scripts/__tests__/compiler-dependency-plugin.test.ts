/** 用真实 TypeScript 编译器验证开发响应，防止清理映射时损坏可执行源码。 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createServer, normalizePath } from 'vite'
import { compilerDependencyPlugin } from '../compiler-dependency-plugin.ts'

test('开发响应保留编译器内部的映射字符串，并能实际编译 TypeScript', async () => {
  const require = createRequire(import.meta.url)
  // 与 Vite 优化产物一致：常量插值折叠后，模板字符串含完整的注释文本。
  const original = (await readFile(require.resolve('typescript'), 'utf8'))
    .replace('${"sourceMappingURL"}', 'sourceMappingURL')
    .replace(/^[\t ]*\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n|$)/gm, '')
  assert.ok(original.includes('//# sourceMappingURL=${sourceMappingURL}'))
  const root = await mkdtemp(path.join(os.tmpdir(), 'kline-compiler-'))
  const file = path.join(root, 'node_modules/.vite/deps/typescript.js')
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    server = await createServer({
      configFile: false,
      root,
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [compilerDependencyPlugin(root)],
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, original + '\n//# sourceMappingURL=data:application/json;base64,e30=\n')
    const address = server.httpServer!.address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}/@fs/${normalizePath(file)}`)
    assert.equal(response.status, 200)
    const source = await response.text()
    assert.equal(source, original + '\n')
    const module = { exports: {} as typeof import('typescript') }
    runInNewContext(source, {
      module,
      exports: module.exports,
      require,
      __filename: file,
      __dirname: path.dirname(file),
    })
    const result = module.exports.transpileModule('const value: number = 42', {
      compilerOptions: { sourceMap: true },
    })
    assert.match(result.outputText, /value = 42/)
    assert.match(result.outputText, /\/\/# sourceMappingURL=/)
  } finally {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  }
})
