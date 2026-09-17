/**
 * 主进程侧的 Provider API Key 加密存储。
 *
 * 密文由 Electron `safeStorage`（背后是 OS keychain / libsecret / DPAPI）产生，
 * 落盘在 `app.getPath('userData')` 下的单个文件里；渲染进程永远拿不到文件路径，
 * 只能经三个 IPC channel 读写。
 */
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** `safeStorage` 中本模块真正用到的部分，便于单测注入替身。 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(cipherText: Buffer): string
}

/** 渲染进程可见的三个 channel；名称带包前缀，避免与其它 IPC 冲突。 */
export const CREDENTIAL_CHANNELS = {
  read: 'klinechart:credential:read',
  write: 'klinechart:credential:write',
  delete: 'klinechart:credential:delete',
} as const

const CREDENTIAL_FILE_NAME = 'provider-credential.json'
const CREDENTIAL_RECORD_VERSION = 1

interface CredentialRecord {
  version: number
  /** base64 编码的 safeStorage 密文。 */
  cipherText: string
}

/**
 * 加密不可用时抛出，**不退回明文**。
 *
 * 判断与理由：某些 Linux 桌面环境缺少可用 keyring，此时 `isEncryptionAvailable()` 为 false。
 * 这种情况下若静默退回明文落盘，用户会以为 Key 已被加密保护，而实际保护等级归零——
 * 「以为安全」比「知道不安全」更危险。因此这里显式失败并把原因回传给渲染进程，
 * 由 UI 告知用户；用户仍可选择走 Web 端那条公开的 localStorage 明文路径，
 * 那条路径的明文属性是他已知的。
 */
export class CredentialEncryptionUnavailableError extends Error {
  readonly code = 'CREDENTIAL_ENCRYPTION_UNAVAILABLE'

  constructor() {
    super(
      'OS-level encryption is unavailable, so the API key cannot be stored securely. ' +
        'Unlock or install a system keyring (for example gnome-keyring or kwallet) and try again.',
    )
    this.name = 'CredentialEncryptionUnavailableError'
  }
}

/** 单条 Provider API Key 的加密存储；所有失败都不落明文。 */
export class EncryptedCredentialStore {
  private readonly safeStorage: SafeStorageLike
  private readonly filePath: string

  constructor(options: { safeStorage: SafeStorageLike; userDataPath: string }) {
    this.safeStorage = options.safeStorage
    this.filePath = join(options.userDataPath, CREDENTIAL_FILE_NAME)
  }

  /**
   * 读取已保存的 Key。
   *
   * 文件缺失、JSON 损坏、密文无法解密（换机器 / keychain 条目被删）一律返回 undefined：
   * 这些都等价于「当前没有可用凭据」，让用户重新输入即可，没有必要把损坏细节冒泡成运行时错误。
   */
  async read(): Promise<string | undefined> {
    const record = await this.readRecord()
    if (!record) return undefined
    if (!this.safeStorage.isEncryptionAvailable()) throw new CredentialEncryptionUnavailableError()
    try {
      const plainText = this.safeStorage.decryptString(Buffer.from(record.cipherText, 'base64'))
      return plainText || undefined
    } catch {
      return undefined
    }
  }

  /** 写入 Key；空字符串等价于删除。 */
  async write(apiKey: string): Promise<void> {
    if (!apiKey) {
      await this.delete()
      return
    }
    if (!this.safeStorage.isEncryptionAvailable()) throw new CredentialEncryptionUnavailableError()
    const record: CredentialRecord = {
      version: CREDENTIAL_RECORD_VERSION,
      cipherText: this.safeStorage.encryptString(apiKey).toString('base64'),
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    // 先写临时文件再 rename，避免写入中断留下半截密文覆盖掉可用凭据。
    const temporaryPath = `${this.filePath}.tmp`
    await writeFile(temporaryPath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.filePath)
    await chmod(this.filePath, 0o600).catch(() => undefined)
  }

  async delete(): Promise<void> {
    await rm(this.filePath, { force: true })
  }

  private async readRecord(): Promise<CredentialRecord | undefined> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch {
      return undefined
    }
    try {
      const record = JSON.parse(raw) as Partial<CredentialRecord>
      return typeof record?.cipherText === 'string' && record.cipherText
        ? {
            version: Number(record.version) || CREDENTIAL_RECORD_VERSION,
            cipherText: record.cipherText,
          }
        : undefined
    } catch {
      return undefined
    }
  }
}

/** `ipcMain` 中本模块用到的部分。 */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: CredentialIpcEvent, ...args: unknown[]) => unknown,
  ): void
}

export interface CredentialIpcEvent {
  readonly senderFrame?: { readonly parent?: unknown } | null
}

/**
 * 注册三个 handler。
 *
 * `isTrustedSender` 由调用方提供（主窗口的 webContents 比对），这里再额外拒绝子 frame：
 * 主窗口里被嵌入的任意 iframe 不应该能读取凭据。
 */
export function registerCredentialIpc(options: {
  ipcMain: IpcMainLike
  store: Pick<EncryptedCredentialStore, 'read' | 'write' | 'delete'>
  isTrustedSender: (event: CredentialIpcEvent) => boolean
}): void {
  const { ipcMain, store, isTrustedSender } = options
  const guard =
    <T>(handler: (...args: unknown[]) => Promise<T>) =>
    async (event: CredentialIpcEvent, ...args: unknown[]): Promise<T> => {
      if (!isTrustedSender(event) || event.senderFrame?.parent) {
        throw new Error('Credential IPC is only available to the main application frame.')
      }
      return await handler(...args)
    }

  ipcMain.handle(
    CREDENTIAL_CHANNELS.read,
    guard(async () => (await store.read()) ?? null),
  )
  ipcMain.handle(
    CREDENTIAL_CHANNELS.write,
    guard(async (apiKey) => {
      if (typeof apiKey !== 'string') throw new TypeError('The API key must be a string.')
      await store.write(apiKey)
      return null
    }),
  )
  ipcMain.handle(
    CREDENTIAL_CHANNELS.delete,
    guard(async () => {
      await store.delete()
      return null
    }),
  )
}
