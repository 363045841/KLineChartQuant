/**
 * preload、渲染进程与主进程共享的凭据桥接契约。
 *
 * channel 名与桥接对象形状单独放这里，是因为 sandbox preload 只能加载 `electron`：
 * 若从主进程模块（credential-ipc）导入常量，会把 `node:fs` / `node:path` 拖进 preload 包，
 * 现在仅靠 tree-shaking 侥幸不触发。本文件不得依赖任何 node 内置模块。
 */

/** 挂在 `window` 上的桥接对象名。 */
export const CREDENTIAL_BRIDGE_KEY = 'klinechartCredentials'

/** 渲染进程可见的三个 channel；名称带包前缀，避免与其它 IPC 冲突。 */
export const CREDENTIAL_CHANNELS = {
  read: 'klinechart:credential:read',
  write: 'klinechart:credential:write',
  delete: 'klinechart:credential:delete',
} as const

/** preload 暴露的全部能力；只有这三个函数。 */
export interface CredentialBridge {
  read(): Promise<string | null>
  write(apiKey: string): Promise<void>
  delete(): Promise<void>
}
