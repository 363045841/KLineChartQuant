/** 宿主凭据边界的稳定契约。
 *
 * 工作台把「Agent API Key 存在哪」的决定权交给宿主（Web 用 localStorage，
 * Electron 用 safeStorage），因此这里只声明读写边界，不关心具体介质。
 * 放在 contracts 而不是 provider 实现里，公开 props 引用它时不会把 pi / Provider
 * 运行时类型（及第三方可选 peer）拖进消费端的类型图。
 */

/** 定义 Provider API Key 的持久化边界。 */
export interface ProviderCredentialStore {
  /** 读取当前 API Key；未配置时返回 undefined。 */
  read(signal?: AbortSignal): Promise<string | undefined>
  /** 写入 API Key。 */
  write(apiKey: string, signal?: AbortSignal): Promise<void>
  /** 删除已保存的 API Key。 */
  delete(signal?: AbortSignal): Promise<void>
}
