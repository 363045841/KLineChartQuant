/**
 * 主进程侧的 Provider API Key 加密存储。
 *
 * 密文由 Electron `safeStorage`（背后是 OS keychain / libsecret / DPAPI）产生，
 * 落盘在 `app.getPath('userData')` 下的单个文件里；渲染进程永远拿不到文件路径，
 * 只能经三个 IPC channel 读写。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { CREDENTIAL_CHANNELS } from './credential-bridge'
import { createMainFrameGuard, type TrustedIpcEvent } from './ipc-guard'

/**
 * `safeStorage` 中本模块真正用到的部分，便于单测注入替身。
 *
 * 只保留异步方法：同步的 `isEncryptionAvailable` / `encryptString` / `decryptString`
 * 在 Electron 45 标记 deprecated，46 将被移除。
 */
export interface SafeStorageLike {
  isAsyncEncryptionAvailable(): Promise<boolean>
  encryptStringAsync(plainText: string): Promise<Buffer>
  decryptStringAsync(cipherText: Buffer): Promise<{ shouldReEncrypt: boolean; result: string }>
}

const CREDENTIAL_FILE_NAME = 'provider-credential.json'
const CREDENTIAL_RECORD_VERSION = 1

/** 落盘记录：只保存 base64 密文，密钥由系统 keychain 持有。 */
interface CredentialRecord {
  version: number
  cipherText: string
}

/**
 * 加密不可用时抛出，**不退回明文**。
 *
 * 判断与理由：某些 Linux 桌面环境缺少可用 keyring，此时安全存储不可用。
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
  /** 临时文件名序号；并发读写时保证 rename 拿回的是自己写的那份内容。 */
  private temporarySequence = 0

  /**
   * @param options.safeStorage 系统加密后端，生产环境传 Electron `safeStorage`
   * @param options.userDataPath 凭据文件所在目录，生产环境传 `app.getPath('userData')`
   */
  constructor(options: { safeStorage: SafeStorageLike; userDataPath: string }) {
    this.safeStorage = options.safeStorage
    this.filePath = join(options.userDataPath, CREDENTIAL_FILE_NAME)
  }

  /**
   * 读取已保存的 Key。
   *
   * 文件缺失、JSON 损坏、密文无法解密（换机器 / keychain 条目被删）一律返回 undefined：
   * 这些都等价于「当前没有可用凭据」，让用户重新输入即可，没有必要把损坏细节冒泡成运行时错误。
   * `safeStorage` 报告 `shouldReEncrypt` 时，顺手用新密钥重写一遍，完成密钥轮换。
   *
   * @returns 解密出的 Key；没有可用凭据时返回 undefined
   */
  async read(): Promise<string | undefined> {
    const record = await this.readRecord()
    if (!record) return undefined
    await this.assertEncryptionAvailable()
    const decrypted = await this.decrypt(record)
    if (!decrypted?.result) return undefined
    if (decrypted.shouldReEncrypt) await this.persist(decrypted.result)
    return decrypted.result
  }

  /**
   * 写入 Key；空字符串等价于删除。
   *
   * @param apiKey 待加密保存的 Key
   */
  async write(apiKey: string): Promise<void> {
    if (!apiKey) {
      await this.delete()
      return
    }
    await this.assertEncryptionAvailable()
    await this.persist(apiKey)
  }

  /** 删除已保存的凭据；文件不存在视为已删除。 */
  async delete(): Promise<void> {
    await rm(this.filePath, { force: true })
  }

  /** 加密并原子写入：先写临时文件再 rename，避免中断留下半截密文。 */
  private async persist(apiKey: string): Promise<void> {
    const cipherText = await this.safeStorage.encryptStringAsync(apiKey)
    const record: CredentialRecord = {
      version: CREDENTIAL_RECORD_VERSION,
      cipherText: cipherText.toString('base64'),
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${++this.temporarySequence}.tmp`
    await writeFile(temporaryPath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
    try {
      await rename(temporaryPath, this.filePath)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw error
    }
  }

  /** 解密落盘记录；密文与当前 keychain 不匹配时按「没有凭据」处理。 */
  private async decrypt(
    record: CredentialRecord,
  ): Promise<{ shouldReEncrypt: boolean; result: string } | undefined> {
    try {
      return await this.safeStorage.decryptStringAsync(Buffer.from(record.cipherText, 'base64'))
    } catch {
      return undefined
    }
  }

  /** 安全存储不可用时显式失败，绝不退回明文。 */
  private async assertEncryptionAvailable(): Promise<void> {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new CredentialEncryptionUnavailableError()
    }
  }

  /** 读取并校验落盘记录；读取、解析或版本不符都当作没有凭据。 */
  private async readRecord(): Promise<CredentialRecord | undefined> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch {
      return undefined
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return undefined
      const { version, cipherText } = parsed as Record<string, unknown>
      return version === CREDENTIAL_RECORD_VERSION &&
        typeof cipherText === 'string' &&
        cipherText.length > 0
        ? { version, cipherText }
        : undefined
    } catch {
      return undefined
    }
  }
}

/** `ipcMain` 中本模块用到的部分，便于单测替换。 */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: CredentialIpcEvent, ...args: unknown[]) => unknown,
  ): void
}

/** 凭据 IPC 事件，与其它主进程通道共用同一套来源门禁。 */
export type CredentialIpcEvent = TrustedIpcEvent

/**
 * 注册三个 handler。
 *
 * `isTrustedSender` 由调用方提供（主窗口的 webContents 比对），这里再额外拒绝子 frame：
 * 主窗口里被嵌入的任意 iframe 不应该能读取凭据。
 *
 * @param options.ipcMain 主进程 IPC 注册入口
 * @param options.store 凭据存储，单测可注入替身
 * @param options.isTrustedSender 判断事件来源是否为主窗口
 */
export function registerCredentialIpc(options: {
  ipcMain: IpcMainLike
  store: Pick<EncryptedCredentialStore, 'read' | 'write' | 'delete'>
  isTrustedSender: (event: CredentialIpcEvent) => boolean
}): void {
  const { ipcMain, store } = options
  const assertTrustedMainFrame = createMainFrameGuard(options.isTrustedSender)
  const guard =
    <T>(handler: (...args: unknown[]) => Promise<T>) =>
    async (event: CredentialIpcEvent, ...args: unknown[]): Promise<T> => {
      assertTrustedMainFrame(event)
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
