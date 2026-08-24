import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  AgentRuntimeError,
  parseProvider302AiSettings,
  type Provider302AiSettings,
  type ProviderCredentialMetadata,
  type ProviderCredentialStore,
  type ProviderSettingsStore,
} from '@363045841yyt/klinechart-agent-runtime'

interface SafeStoragePort {
  isAsyncEncryptionAvailable(): Promise<boolean>
  getSelectedStorageBackend():
    | 'basic_text'
    | 'gnome_libsecret'
    | 'kwallet'
    | 'kwallet5'
    | 'kwallet6'
    | 'unknown'
  encryptStringAsync(value: string): Promise<Buffer>
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}

interface EncryptedCredentialFile {
  version: 1
  ciphertext: string
}

function storageError(cause: unknown): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_ERROR', 'The Provider credential store is unavailable.', {
    retryable: true,
    recommendedAction: 'Retry or re-enter the Provider credential.',
    cause,
  })
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

async function atomicJsonWrite(filePath: string, value: unknown): Promise<void> {
  const directory = dirname(filePath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function parseCredentialFile(value: unknown): EncryptedCredentialFile {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('ciphertext' in value) ||
    typeof value.ciphertext !== 'string' ||
    !value.ciphertext
  ) {
    throw storageError(new TypeError('Invalid encrypted credential envelope.'))
  }
  return { version: 1, ciphertext: value.ciphertext }
}

export interface ElectronSafeStorageCredentialStoreOptions {
  filePath: string
  safeStorage: SafeStoragePort
  platform?: NodeJS.Platform
}

export class ElectronSafeStorageCredentialStore implements ProviderCredentialStore {
  private readonly filePath: string
  private readonly safeStorage: SafeStoragePort
  private readonly platform: NodeJS.Platform
  private memoryKey: string | undefined
  private resolvedMetadata: ProviderCredentialMetadata | undefined

  constructor(options: ElectronSafeStorageCredentialStoreOptions) {
    this.filePath = options.filePath
    this.safeStorage = options.safeStorage
    this.platform = options.platform ?? process.platform
  }

  async metadata(): Promise<ProviderCredentialMetadata> {
    if (this.resolvedMetadata) return { ...this.resolvedMetadata }
    const encryptionAvailable = await this.safeStorage
      .isAsyncEncryptionAvailable()
      .catch(() => false)
    const weakLinuxBackend =
      this.platform === 'linux' &&
      ['basic_text', 'unknown'].includes(this.safeStorage.getSelectedStorageBackend())
    this.resolvedMetadata =
      encryptionAvailable && !weakLinuxBackend
        ? { persistenceMode: 'encrypted' }
        : {
            persistenceMode: 'memory-only',
            warning: 'Secure credential storage is unavailable. The API key will be forgotten on exit.',
          }
    return { ...this.resolvedMetadata }
  }

  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    if ((await this.metadata()).persistenceMode === 'memory-only') return this.memoryKey
    try {
      const envelope = parseCredentialFile(JSON.parse(await readFile(this.filePath, 'utf8')))
      signal?.throwIfAborted()
      const decrypted = await this.safeStorage.decryptStringAsync(
        Buffer.from(envelope.ciphertext, 'base64'),
      )
      signal?.throwIfAborted()
      if (decrypted.shouldReEncrypt) await this.write(decrypted.result, signal)
      return decrypted.result
    } catch (error) {
      if (isMissing(error)) return undefined
      if (error instanceof AgentRuntimeError) throw error
      throw storageError(error)
    }
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if ((await this.metadata()).persistenceMode === 'memory-only') {
      this.memoryKey = apiKey
      return
    }
    try {
      const encrypted = await this.safeStorage.encryptStringAsync(apiKey)
      signal?.throwIfAborted()
      await atomicJsonWrite(this.filePath, {
        version: 1,
        ciphertext: encrypted.toString('base64'),
      } satisfies EncryptedCredentialFile)
    } catch (error) {
      throw storageError(error)
    }
  }

  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.memoryKey = undefined
    try {
      await unlink(this.filePath)
    } catch (error) {
      if (!isMissing(error)) throw storageError(error)
    }
  }
}

export class ElectronProviderSettingsStore implements ProviderSettingsStore {
  constructor(private readonly filePath: string) {}

  async read(signal?: AbortSignal): Promise<Provider302AiSettings | undefined> {
    signal?.throwIfAborted()
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      signal?.throwIfAborted()
      return parseProvider302AiSettings(value)
    } catch (error) {
      if (isMissing(error)) return undefined
      if (error instanceof AgentRuntimeError) throw error
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The saved Provider settings are invalid.', {
        recommendedAction: 'Test the Provider connection again.',
        cause: error,
      })
    }
  }

  async write(settings: Provider302AiSettings, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    try {
      await atomicJsonWrite(this.filePath, settings)
    } catch (error) {
      throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider settings could not be saved.', {
        retryable: true,
        recommendedAction: 'Retry the Provider connection test.',
        cause: error,
      })
    }
  }
}
