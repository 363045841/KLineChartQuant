/**
 * 定义组合：Node 只持有计算描述，不绑定任何渲染器。
 */
import { createDefinitionRegistry, type DefinitionRegistry } from '@363045841yyt/klinechart-core/node'

/** 创建空定义注册表；脚本与警报定义由后续装配写入。 */
export function composeDefinitions(): DefinitionRegistry {
  return createDefinitionRegistry()
}
