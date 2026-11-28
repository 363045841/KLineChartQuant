/** 用户脚本工作区编解码：三种文件夹类型都必须可持久化。 */
import { expect, it } from 'vitest'
import { decodeScriptWorkspace } from '../impl/scriptWorkspaceCodec.js'

it.each(['indicator', 'alert', 'library'] as const)('keeps %s folders', (kind) => {
  expect(
    decodeScriptWorkspace({ scripts: [], folders: [{ kind, path: 'Group' }] }),
  ).toEqual({ scripts: [], folders: [{ kind, path: 'Group' }] })
})

it('rejects unknown folder kinds', () => {
  expect(() =>
    decodeScriptWorkspace({ scripts: [], folders: [{ kind: 'other', path: 'Group' }] }),
  ).toThrow('用户脚本文件夹类型错误')
})
