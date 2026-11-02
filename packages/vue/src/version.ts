/** 发布版本标识：包版本与构建提交哈希，供产品内部与消费方追溯。 */
import pkg from '../package.json'
export const VERSION = pkg.version
export { VERSION as CORE_VERSION } from '@363045841yyt/klinechart-core'

/** 构建时注入的提交短哈希，对应本次产物实际编译的代码。 */
export const COMMIT_HASH: string = import.meta.env.VITE_KLINE_COMMIT_HASH

/** 构建时注入的提交时间（提交自身时区的 YYYY-MM-DD HH:mm）。 */
export const COMMIT_TIME: string = import.meta.env.VITE_KLINE_COMMIT_TIME
