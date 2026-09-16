/**
 * preload 与渲染进程共享的桥接契约。
 *
 * 单独成文件是为了让渲染侧能引用它而不触碰 `electron` 模块。
 */

/** 挂在 `window` 上的桥接对象名。 */
export const CREDENTIAL_BRIDGE_KEY = 'klinechartCredentials'

/** preload 暴露的全部能力；只有这三个函数。 */
export interface CredentialBridge {
  read(): Promise<string | null>
  write(apiKey: string): Promise<void>
  delete(): Promise<void>
}
