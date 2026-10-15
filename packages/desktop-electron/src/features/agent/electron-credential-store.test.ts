// 验证渲染侧凭据存储只经 preload 桥接读写，且桥接缺失时可被检出。
import { describe, expect, it, vi } from 'vitest'

import { CREDENTIAL_BRIDGE_KEY } from '../../../electron/credential-bridge'

import {
  createElectronCredentialStore,
  ElectronCredentialStore,
  readCredentialBridge,
} from './electron-credential-store'

/** 构造带桥接对象的假 window 作用域。 */
function createScope(bridge: unknown): Record<string, unknown> {
  return { [CREDENTIAL_BRIDGE_KEY]: bridge }
}

function createBridge() {
  return {
    read: vi.fn(async () => 'sk-secret-value' as string | null),
    write: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

describe('ElectronCredentialStore', () => {
  it('reads, writes and deletes through the bridge', async () => {
    const bridge = createBridge()
    const store = new ElectronCredentialStore(bridge)

    await expect(store.read()).resolves.toBe('sk-secret-value')
    await store.write('sk-next')
    await store.delete()

    expect(bridge.write).toHaveBeenCalledWith('sk-next')
    expect(bridge.delete).toHaveBeenCalledTimes(1)
  })

  it('maps an absent key to undefined', async () => {
    const bridge = createBridge()
    bridge.read.mockResolvedValue(null)

    await expect(new ElectronCredentialStore(bridge).read()).resolves.toBeUndefined()
  })

  it('propagates the main-process error instead of falling back to plaintext', async () => {
    const bridge = createBridge()
    bridge.write.mockRejectedValue(new Error('OS-level encryption is unavailable'))

    await expect(new ElectronCredentialStore(bridge).write('sk-next')).rejects.toThrow(
      /encryption is unavailable/,
    )
  })

  it('honours an aborted signal before touching the bridge', async () => {
    const bridge = createBridge()

    await expect(new ElectronCredentialStore(bridge).read(AbortSignal.abort())).rejects.toThrow()
    expect(bridge.read).not.toHaveBeenCalled()
  })
})

describe('createElectronCredentialStore', () => {
  it('builds a store when the preload bridge is present', () => {
    expect(createElectronCredentialStore(createScope(createBridge()))).toBeInstanceOf(
      ElectronCredentialStore,
    )
  })

  it('returns undefined outside Electron so the host can fall back', () => {
    expect(createElectronCredentialStore({})).toBeUndefined()
  })

  it('rejects an incomplete bridge rather than failing later at call time', () => {
    expect(readCredentialBridge(createScope({ read: () => undefined }))).toBeUndefined()
  })
})
