/** 指标定义的默认参数解析：计算默认值与展示默认选项合并成实例初始参数。 */
import type { IndicatorMetadata } from './indicatorMetadata.js'

/**
 * 读取定义的默认参数。
 *
 * runtime.defaultParams 可能是函数，展示默认选项只影响初始展示值；
 * 两者在这里合并，调用方不再各自复制一份默认值。
 */
export function resolveDefinitionDefaultParams(
  definition: IndicatorMetadata,
): Record<string, unknown> {
  const runtime = definition.runtime
  const declared = runtime?.defaultParams
  const defaults =
    typeof declared === 'function'
      ? (declared as () => Record<string, unknown>)()
      : (declared ?? {})
  return {
    ...defaults,
    ...(definition.presentation?.defaultOptions ?? {}),
  }
}
