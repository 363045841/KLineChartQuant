/** 在没有 process、require 和 ts.sys 的浏览器式 TypeScript 环境回归 Request 编译。 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as vfs from '@typescript/vfs'
import ts from 'typescript'
import { expect, it } from 'vitest'
import * as errors from '../../errors.js'
import type { compileScriptRequests } from '../../quickjs/impl/compileScriptRequests.js'

it('Request 编译只使用 VFS，不读取宿主 ts.sys', () => {
  const require = createRequire(import.meta.url)
  const browserTs: typeof ts = runInNewContext(
    `${readFileSync(require.resolve('typescript'), 'utf8')}\n;ts`,
    {},
  )
  expect(browserTs.sys).toBeUndefined()
  const source = readFileSync(
    new URL('../../quickjs/impl/compileScriptRequests.ts', import.meta.url),
    'utf8',
  )
  const compiled = browserTs.transpileModule(source, {
    compilerOptions: {
      module: browserTs.ModuleKind.CommonJS,
      target: browserTs.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const compile: typeof compileScriptRequests = runInNewContext(
    `${compiled}\n;exports.compileScriptRequests`,
    {
      exports: {},
      require(name: string) {
        if (name === 'typescript') return browserTs
        if (name === '@typescript/vfs') return vfs
        if (name === '../../errors.js') return errors
        throw new Error(`Unexpected compiler import: ${name}`)
      },
    },
  )
  expect(compile(`defineIndicator({onBar(){plot.Line(close,'close')}})`)).toContain('plot.Line')
  expect(
    compile(
      `defineIndicator({onBar(){const value=request.security('BTCUSDT','60',()=>close);plot.Line(value,'hour')}})`,
    ),
  ).toContain(`__declareRequest("0", 'BTCUSDT', '60', {})`)
  expect(() =>
    compile(
      `defineIndicator({onBar(){const price=close+1;request.security('BTCUSDT','60',()=>price)}})`,
    ),
  ).toThrow('不能捕获')
})
