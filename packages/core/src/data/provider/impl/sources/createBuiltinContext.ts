/** 用内置数据源装配行情宿主；预览源与配置恢复由宿主自己追加。 */
import { MarketDataContext } from '../../../management/context.js'
import { installBuiltinProviders } from './builtinProviders.js'
import type { HttpSourceOptions } from './createHttpSource.js'

/**
 * 创建注册了全部内置数据源的行情宿主。
 *
 * @param options - 宿主 fetch 与事件流
 * @returns 尚未恢复配置的行情宿主
 */
export function createBuiltinMarketDataContext(options: HttpSourceOptions): MarketDataContext {
  const context = new MarketDataContext()
  installBuiltinProviders(context.registry, options)
  return context
}
