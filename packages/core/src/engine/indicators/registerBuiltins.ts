/** 内置定义装配：消费 @Indicator 自动生成的入口，不维护模块或定义类清单。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { loadBuiltinDefinitionClasses } from './generated/builtinIndicators.js'
import { registerBuiltinRenderers } from './generated/builtinRenderers.js'
import {
  getRegisteredIndicatorDefinitions,
  type IndicatorDefinitionClass,
  registerIndicatorDefinition,
} from './indicatorDefinitionRegistry.js'

let loaded = false
let loading: Promise<IndicatorDefinitionClass[]> | undefined

/** 自动加载所有内置定义；并发调用共享加载任务，失败后允许重试。 */
export async function loadBuiltinIndicators(): Promise<void> {
  registerBuiltinRenderers()
  loading ??= loadBuiltinDefinitionClasses()
  try {
    for (const definition of await loading) {
      registerIndicatorDefinition(definition)
    }
    loaded = true
  } catch (error) {
    loading = undefined
    throw error
  }
}

/** 返回已完成装配的定义目录，未初始化时报告调用顺序错误。 */
export function getBuiltinIndicatorDefinitions() {
  if (!loaded) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_STATE,
      'Builtin indicators not loaded yet. Call await loadBuiltinIndicators() first.',
    )
  }
  return getRegisteredIndicatorDefinitions()
}

/** 查询内置指标是否已成功完成首次装配。 */
export function isBuiltinIndicatorsLoaded(): boolean {
  return loaded
}
