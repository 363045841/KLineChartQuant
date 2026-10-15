// 验证主进程侧的 safeStorage 凭据存储与 IPC 来源校验。
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CREDENTIAL_CHANNELS,
  CredentialEncryptionUnavailableError,
  type CredentialIpcEvent,
  EncryptedCredentialStore,
  registerCredentialIpc,
  type SafeStorageLike,
} from './credential-ipc'

const workDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    workDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

/** 可逆的假加密：前缀标记足以区分密文与明文。 */
function createSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
    decryptString: (cipherText) => {
      const raw = cipherText.toString('utf8')
      if (!raw.startsWith('enc:')) throw new Error('bad ciphertext')
      return raw.slice(4)
    },
  }
}

async function createStore(safeStorage = createSafeStorage()): Promise<{
  store: EncryptedCredentialStore
  filePath: string
}> {
  const userDataPath = await mkdtemp(join(tmpdir(), 'kq-credential-'))
  workDirectories.push(userDataPath)
  return {
    store: new EncryptedCredentialStore({ safeStorage, userDataPath }),
    filePath: join(userDataPath, 'provider-credential.json'),
  }
}

describe('EncryptedCredentialStore', () => {
  it('round-trips the key through safeStorage without writing plaintext to disk', async () => {
    const { store, filePath } = await createStore()

    await store.write('sk-secret-value')

    await expect(readFile(filePath, 'utf8')).resolves.not.toContain('sk-secret-value')
    await expect(store.read()).resolves.toBe('sk-secret-value')
  })

  it('returns undefined when the credential file is missing', async () => {
    const { store } = await createStore()
    await expect(store.read()).resolves.toBeUndefined()
  })

  it('returns undefined when the stored ciphertext cannot be decrypted', async () => {
    const { store, filePath } = await createStore()
    await store.write('sk-secret-value')
    await writeFile(filePath, JSON.stringify({ version: 1, cipherText: 'bm90LWVuYw==' }), 'utf8')

    await expect(store.read()).resolves.toBeUndefined()
  })

  it('returns undefined when the credential file is not valid JSON', async () => {
    const { store, filePath } = await createStore()
    await store.write('sk-secret-value')
    await writeFile(filePath, '{ broken', 'utf8')

    await expect(store.read()).resolves.toBeUndefined()
  })

  it('refuses to store anything when encryption is unavailable', async () => {
    const { store, filePath } = await createStore(createSafeStorage(false))

    await expect(store.write('sk-secret-value')).rejects.toBeInstanceOf(
      CredentialEncryptionUnavailableError,
    )
    await expect(readFile(filePath, 'utf8')).rejects.toThrow()
  })

  it('deletes the stored key', async () => {
    const { store } = await createStore()
    await store.write('sk-secret-value')

    await store.delete()

    await expect(store.read()).resolves.toBeUndefined()
  })

  it('treats an empty key as a delete', async () => {
    const { store, filePath } = await createStore()
    await store.write('sk-secret-value')

    await store.write('')

    await expect(readFile(filePath, 'utf8')).rejects.toThrow()
  })
})

describe('registerCredentialIpc', () => {
  /** 收集注册的 handler，模拟 ipcMain。 */
  function createIpcMain() {
    const handlers = new Map<string, (event: CredentialIpcEvent, ...args: unknown[]) => unknown>()
    return {
      handlers,
      handle(
        channel: string,
        listener: (event: CredentialIpcEvent, ...args: unknown[]) => unknown,
      ) {
        handlers.set(channel, listener)
      },
    }
  }

  const store = { read: vi.fn(), write: vi.fn(), delete: vi.fn() }

  function setup(isTrustedSender: (event: CredentialIpcEvent) => boolean = () => true) {
    store.read.mockReset().mockResolvedValue('sk-secret-value')
    store.write.mockReset().mockResolvedValue(undefined)
    store.delete.mockReset().mockResolvedValue(undefined)
    const ipcMain = createIpcMain()
    registerCredentialIpc({ ipcMain, store, isTrustedSender })
    return ipcMain
  }

  const mainFrameEvent: CredentialIpcEvent = { senderFrame: { parent: null } }

  it('exposes exactly the three credential channels', () => {
    expect([...setup().handlers.keys()]).toEqual([
      CREDENTIAL_CHANNELS.read,
      CREDENTIAL_CHANNELS.write,
      CREDENTIAL_CHANNELS.delete,
    ])
  })

  it('forwards read, write and delete to the store', async () => {
    const ipcMain = setup()

    await expect(ipcMain.handlers.get(CREDENTIAL_CHANNELS.read)!(mainFrameEvent)).resolves.toBe(
      'sk-secret-value',
    )
    await ipcMain.handlers.get(CREDENTIAL_CHANNELS.write)!(mainFrameEvent, 'sk-next')
    await ipcMain.handlers.get(CREDENTIAL_CHANNELS.delete)!(mainFrameEvent)

    expect(store.write).toHaveBeenCalledWith('sk-next')
    expect(store.delete).toHaveBeenCalledTimes(1)
  })

  it('rejects senders that are not the main window', async () => {
    const ipcMain = setup(() => false)

    await expect(ipcMain.handlers.get(CREDENTIAL_CHANNELS.read)!(mainFrameEvent)).rejects.toThrow(
      /main application frame/,
    )
    expect(store.read).not.toHaveBeenCalled()
  })

  it('rejects sub frames of the trusted sender', async () => {
    const ipcMain = setup()

    await expect(
      ipcMain.handlers.get(CREDENTIAL_CHANNELS.read)!({ senderFrame: { parent: {} } }),
    ).rejects.toThrow(/main application frame/)
    expect(store.read).not.toHaveBeenCalled()
  })

  it('rejects a non-string key instead of storing it', async () => {
    const ipcMain = setup()

    await expect(
      ipcMain.handlers.get(CREDENTIAL_CHANNELS.write)!(mainFrameEvent, 42),
    ).rejects.toBeInstanceOf(TypeError)
    expect(store.write).not.toHaveBeenCalled()
  })
})
