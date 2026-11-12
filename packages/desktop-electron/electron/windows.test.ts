/** 验证关闭与退出应用的会话语义；仅替代 Electron 窗口能力，落盘使用真实仓库。 */
// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createWorkspaceSessionStore } from './window-store'
import { createWindowSet, type WorkspaceWindow } from './windows'

/** 保留真实事件订阅和销毁顺序，避免假定 BrowserWindow 的全部成员。 */
class TestWindow extends EventEmitter implements WorkspaceWindow {
  readonly webContents = { send: vi.fn() }
  constructor(readonly id: number) {
    super()
  }
  close() {
    this.emit('closed')
  }
  isMinimized() {
    return false
  }
  restore() {}
  focus() {}
  minimize() {}
  maximize() {}
  unmaximize() {}
  isMaximized() {
    return false
  }
}

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kcq-windows-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it.each([false, true])('退出应用=%s：重启保留最后窗口或退出前完整会话', async (quitting) => {
  const session = createWorkspaceSessionStore(directory)
  const writes: Promise<void>[] = []
  let id = 0
  const windows = createWindowSet(
    (ids) => {
      writes.push(session.save(ids))
    },
    () => new TestWindow(++id),
  )
  const first = windows.open('first')
  const last = windows.open('last')
  if (quitting) windows.preserveSession()
  first.close()
  last.close()
  expect(windows.size).toBe(0)
  await Promise.all(writes)
  await session.flush()
  expect(await createWorkspaceSessionStore(directory).load()).toEqual(
    quitting ? ['first', 'last'] : ['last'],
  )
})
