/** 构建环境声明：由各 Vite 配置注入的 import.meta.env 键。 */
interface ImportMetaEnv {
  /** 构建时注入的提交短哈希，对应本次产物实际编译的代码。 */
  readonly VITE_KLINE_COMMIT_HASH: string
  /** 构建时注入的提交时间（提交自身时区的 YYYY-MM-DD HH:mm）。 */
  readonly VITE_KLINE_COMMIT_TIME: string
}
