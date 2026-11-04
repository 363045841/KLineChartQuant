/**
 * 主进程凭据存储与 IPC 门禁的回归测试。
 *
 * 假 `safeStorage` 只在密文前加 `key:n:` 前缀，用来分辨密文 / 明文并驱动密钥轮换，
 * 不模拟任何平台 keychain 行为，也不需要真实 Electron。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CREDENTIAL_CHANNELS } from './credential-bridge'
import {
  CredentialEncryptionUnavailableError,
  type CredentialIpcEvent,
  EncryptedCredentialStore,
  registerCredentialIpc,
  type SafeStorageLike,
} from './credential-ipc'

/** 落盘文件名属于磁盘契约，测试按字面量断言，改动即视为破坏兼容。 */
const CREDENTIAL_FILE = 'provider-credential.json'
const SECRET = 'sk-secret-value'

const workDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    workDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

/** 假加密后端状态；`key` 变化模拟 keychain 轮换密钥。 */
interface SafeStorageState {
  available: boolean
  key: string
  shouldReEncrypt: boolean
}

/** 可切换可用性与轮换标记的假 safeStorage。 */
function createSafeStorage(options: {
  available?: boolean
  shouldReEncrypt?: boolean
}): { safeStorage: SafeStorageLike; state: SafeStorageState } {
  const state: SafeStorageState = {
    available: options.available ?? true,
    key: 'key-1',
    shouldReEncrypt: options.shouldReEncrypt ?? false,
  }
  const safeStorage: SafeStorageLike = {
    isAsyncEncryptionAvailable: async () => state.available,
    encryptStringAsync: async (plainText) => Buffer.from(`${state.key}:${plainText}`, 'utf8'),
    decryptStringAsync: async (cipherText) => {
      const raw = cipherText.toString('utf8')
      const separator = raw.indexOf(':')
      if (separator < 0) throw new Error('ciphertext was not produced by this storage')
      return { result: raw.slice(separator + 1), shouldReEncrypt: state.shouldReEncrypt }
    },
  }
  return { safeStorage, state }
}

/** 在独立临时 userData 目录里建一个存储。 */
async function createStore(
  safeStorage: SafeStorageLike = createSafeStorage({}).safeStorage,
): Promise<{ store: EncryptedCredentialStore; filePath: string }> {
  const userDataPath = await mkdtemp(join(tmpdir(), 'kq-credential-'))
  workDirectories.push(userDataPath)
  return {
    store: new EncryptedCredentialStore({ safeStorage, userDataPath }),
    filePath: join(userDataPath, CREDENTIAL_FILE),
  }
}

describe('EncryptedCredentialStore', () => {
  it('round-trips the key without writing plaintext to disk', async () => {
    const { store, filePath } = await createStore()

    await store.write(SECRET)

    await expect(readFile(filePath, 'utf8')).resolves.not.toContain(SECRET)
    await expect(store.read()).resolves.toBe(SECRET)
  })

  it('re-encrypts the key when safeStorage reports a rotated key', async () => {
    const { safeStorage, state } = createSafeStorage({ shouldReEncrypt: true })
    const { store, filePath } = await createStore(safeStorage)
    await store.write(SECRET)
    state.key = 'key-2'

    await expect(store.read()).resolves.toBe(SECRET)

    const rotated = Buffer.from(`key-2:${SECRET}`, 'utf8').toString('base64')
    await expect(readFile(filePath, 'utf8')).resolves.toContain(rotated)
  })

  const unreadableFiles: ReadonlyArray<readonly [string, string | undefined]> = [
    ['the credential file is missing', undefined],
    ['the credential file is not JSON', '{ broken'],
    ['the record has no ciphertext', JSON.stringify({ version: 1 })],
    [
      'the record version is unknown',
      JSON.stringify({ version: 99, cipherText: Buffer.from(`key-1:${SECRET}`).toString('base64') }),
    ],
    [
      'the ciphertext cannot be decrypted',
      JSON.stringify({ version: 1, cipherText: Buffer.from('foreign').toString('base64') }),
    ],
    [
      'the decrypted key is empty',
      JSON.stringify({ version: 1, cipherText: Buffer.from('key-1:').toString('base64') }),
    ],
  ]

  it.each(unreadableFiles)('returns undefined when %s', async (_label, content) => {
    const { store, filePath } = await createStore()
    if (content !== undefined) await writeFile(filePath, content, 'utf8')

    await expect(store.read()).resolves.toBeUndefined()
  })

  it('refuses to read or write while encryption is unavailable', async () => {
    const { safeStorage, state } = createSafeStorage({})
    const { store, filePath } = await createStore(safeStorage)
    await store.write(SECRET)
    state.available = false

    await expect(store.read()).rejects.toBeInstanceOf(CredentialEncryptionUnavailableError)
    await expect(store.write('sk-next')).rejects.toBeInstanceOf(
      CredentialEncryptionUnavailableError,
    )
    // 失败不能碰已有凭据：密文仍在，且没有写入新的明文文件。
    await expect(readFile(filePath, 'utf8')).resolves.toContain('cipherText')
  })

  it('treats an empty key as a delete', async () => {
    const { store, filePath } = await createStore()
    await store.write(SECRET)

    await store.write('')

    await expect(readFile(filePath, 'utf8')).rejects.toThrow()
  })
})

/** 注册后拿到的 handler 签名，与 `IpcMainLike.handle` 一致。 */
type Handler = (event: CredentialIpcEvent, ...args: unknown[]) => unknown

const trustedSender = { id: 1 }
const mainFrame: CredentialIpcEvent = { sender: trustedSender, senderFrame: { parent: null } }

/** 收集注册的 handler，替代真实 `ipcMain`。 */
function setup() {
  const handlers = new Map<string, Handler>()
  const store = {
    read: vi.fn(async (): Promise<string | undefined> => SECRET),
    write: vi.fn(async (_apiKey: string) => {}),
    delete: vi.fn(async () => {}),
  }
  registerCredentialIpc({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    store,
    // 与 main.ts 相同：只信任主窗口的 webContents。
    isTrustedSender: (event) => event.sender === trustedSender,
  })
  const call = (
    channel: keyof typeof CREDENTIAL_CHANNELS,
    event: CredentialIpcEvent = mainFrame,
    ...args: unknown[]
  ) => handlers.get(CREDENTIAL_CHANNELS[channel])!(event, ...args)
  return { store, call }
}

describe('registerCredentialIpc', () => {
  it('forwards read, write and delete to the store', async () => {
    const { store, call } = setup()

    await expect(call('read')).resolves.toBe(SECRET)
    await expect(call('write', mainFrame, 'sk-next')).resolves.toBeNull()
    await expect(call('delete')).resolves.toBeNull()

    expect(store.write).toHaveBeenCalledWith('sk-next')
    expect(store.delete).toHaveBeenCalledTimes(1)
  })

  it('maps a missing key to null so the renderer sees one absence value', async () => {
    const { store, call } = setup()
    store.read.mockResolvedValue(undefined)

    await expect(call('read')).resolves.toBeNull()
  })

  const rejectedSenders: ReadonlyArray<readonly [string, CredentialIpcEvent]> = [
    ['a sender other than the main window', { sender: { id: 2 }, senderFrame: { parent: null } }],
    ['a sub frame of the main window', { sender: trustedSender, senderFrame: { parent: {} } }],
  ]

  it.each(rejectedSenders)('rejects %s on every channel', async (_label, event) => {
    const { store, call } = setup()

    await expect(call('read', event)).rejects.toThrow(/main application frame/)
    await expect(call('write', event, SECRET)).rejects.toThrow(/main application frame/)
    await expect(call('delete', event)).rejects.toThrow(/main application frame/)

    expect(store.read).not.toHaveBeenCalled()
    expect(store.write).not.toHaveBeenCalled()
    expect(store.delete).not.toHaveBeenCalled()
  })

  it('rejects a non-string key instead of storing it', async () => {
    const { store, call } = setup()

    await expect(call('write', mainFrame, 42)).rejects.toBeInstanceOf(TypeError)
    expect(store.write).not.toHaveBeenCalled()
  })
})
