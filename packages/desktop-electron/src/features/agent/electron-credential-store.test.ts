/**
 * 渲染侧凭据存储的回归测试：只经 preload 桥接读写，桥接缺失或残缺时由宿主退回默认实现。
 */
import { describe, expect, it, vi } from 'vitest'

import { CREDENTIAL_BRIDGE_KEY } from '../../../electron/credential-bridge'

import { createElectronCredentialStore, ElectronCredentialStore } from './electron-credential-store'

const SECRET = 'sk-secret-value'

/** preload 会注入的桥接对象，默认已有一个保存好的 Key。 */
function createBridge() {
  return {
    read: vi.fn(async () => SECRET as string | null),
    write: vi.fn(async (_apiKey: string) => {}),
    delete: vi.fn(async () => {}),
  }
}

describe('ElectronCredentialStore', () => {
  it('forwards reads, writes and deletes to the bridge', async () => {
    const bridge = createBridge()
    const store = new ElectronCredentialStore(bridge)

    await expect(store.read()).resolves.toBe(SECRET)
    await store.write('sk-next')
    await store.delete()

    expect(bridge.write).toHaveBeenCalledWith('sk-next')
    expect(bridge.delete).toHaveBeenCalledTimes(1)
  })

  it('maps the bridge null to undefined', async () => {
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
})

describe('createElectronCredentialStore', () => {
  it('builds a store when the preload bridge is present', () => {
    expect(
      createElectronCredentialStore({ [CREDENTIAL_BRIDGE_KEY]: createBridge() }),
    ).toBeInstanceOf(ElectronCredentialStore)
  })

  it('reports no store when the bridge is absent or incomplete', () => {
    expect(createElectronCredentialStore({})).toBeUndefined()
    // 残缺桥接在构造期就被拒绝，而不是等到调用时才抛 undefined is not a function。
    expect(
      createElectronCredentialStore({ [CREDENTIAL_BRIDGE_KEY]: { read: async () => null } }),
    ).toBeUndefined()
  })
})
