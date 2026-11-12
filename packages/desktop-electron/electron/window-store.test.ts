/** 用真实文件系统验证会话清单的并发提交、重启读取和失败后的恢复。 */
// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createWorkspaceSessionStore } from './window-store'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kcq-session-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it('并发保存全部完成，重启读取最后一次调用的快照而非最后完成的旧快照', async () => {
  const store = createWorkspaceSessionStore(directory)
  const snapshots = Array.from({ length: 20 }, (_, index) => [`workspace-${index}`])
  const writes = snapshots.map((ids) => store.save(ids))
  snapshots.at(-1)!.push('late-mutation')
  await Promise.all(writes)
  await store.flush()
  expect(await createWorkspaceSessionStore(directory).load()).toEqual(['workspace-19'])
})

it('保存失败传播给调用方，恢复文件系统后后续提交仍可成功', async () => {
  const path = join(directory, 'blocked')
  await writeFile(path, 'not a directory')
  const store = createWorkspaceSessionStore(path)
  await expect(store.save(['failed'])).rejects.toBeDefined()
  await rm(path)
  await mkdir(path)
  await store.save(['restored'])
  expect(await store.load()).toEqual(['restored'])
})
