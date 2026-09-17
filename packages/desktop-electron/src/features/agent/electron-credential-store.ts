/**
 * 渲染侧的 `ProviderCredentialStore`：把 Provider API Key 的读写交给主进程的
 * `safeStorage`，密文与明文都不经过 localStorage。
 */
import { CREDENTIAL_BRIDGE_KEY, type CredentialBridge } from '../../../electron/credential-bridge'

import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'

/** 读取 preload 注入的桥接对象；非 Electron 宿主下返回 undefined。 */
export function readCredentialBridge(scope: unknown = globalThis): CredentialBridge | undefined {
  const bridge = (scope as Record<string, unknown> | undefined)?.[CREDENTIAL_BRIDGE_KEY]
  if (!bridge || typeof bridge !== 'object') return undefined
  const candidate = bridge as Partial<CredentialBridge>
  return typeof candidate.read === 'function' &&
    typeof candidate.write === 'function' &&
    typeof candidate.delete === 'function'
    ? (candidate as CredentialBridge)
    : undefined
}

/**
 * 经 IPC 访问加密存储。
 *
 * 加密不可用时主进程会抛错，错误经 IPC 原样冒泡到调用方由 UI 呈现——
 * 这里**不做任何明文兜底**。
 */
export class ElectronCredentialStore implements ProviderCredentialStore {
  constructor(private readonly bridge: CredentialBridge) {}

  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    return (await this.bridge.read()) || undefined
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    await this.bridge.write(apiKey)
  }

  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    await this.bridge.delete()
  }
}

/**
 * 仅在 preload 桥接可用时构造存储。
 *
 * 返回 undefined 时调用方应退回 bridge 的默认实现（Web 端那条 localStorage 路径），
 * 保证缺少 preload 不会让应用起不来。
 */
export function createElectronCredentialStore(
  scope: unknown = globalThis,
): ElectronCredentialStore | undefined {
  const bridge = readCredentialBridge(scope)
  return bridge ? new ElectronCredentialStore(bridge) : undefined
}
