/**
 * 指标渲染 Layer 命名：按定义身份解析 renderer / scale 的 plugin 名称。
 *
 * 独立成叶子模块，使指标实现只依赖「命名解析」而不依赖「定义目录」，避免
 * 「注册表 → 生成的目录 → 指标实现 → 注册表」形成循环依赖。命名规则由注册表在
 * 装配定义时写入，实现层只读取。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type {
  IndicatorAuxiliaryRendererNameResolver,
  IndicatorRendererNameResolver,
} from './indicatorMetadata.js'

/** 将名称和别名转换为统一的查询键。 */
export function normalizeIndicatorId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** 单个定义的 Layer 命名规则：renderer 与 scale 两个解析器。 */
type IndicatorLayerNamingRule = {
  readonly renderer: IndicatorRendererNameResolver
  readonly scale: IndicatorAuxiliaryRendererNameResolver
}

const namingRules = new Map<string, IndicatorLayerNamingRule>()

/** 按定义身份（内部名、展示名、别名）登记 Layer 命名规则。 */
export function registerIndicatorLayerNaming(
  identity: ReadonlyArray<string>,
  renderer: IndicatorRendererNameResolver,
  scale: IndicatorAuxiliaryRendererNameResolver,
): void {
  const rule: IndicatorLayerNamingRule = { renderer, scale }
  for (const id of identity) {
    const key = normalizeIndicatorId(id)
    if (key) namingRules.set(key, rule)
  }
}

/** 按定义身份解析数据或坐标轴 Layer ID；身份未登记时抛错。 */
export function resolveIndicatorLayerId(
  definitionId: string,
  paneId: string,
  part: 'renderer' | 'scale' = 'renderer',
): string {
  const rule = namingRules.get(normalizeIndicatorId(definitionId))
  const options = { paneId, indicatorId: definitionId }
  const name = part === 'renderer' ? rule?.renderer(options) : rule?.scale(options)
  if (!name)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `[Indicator] missing ${part} identity for '${definitionId}'`,
    )
  return makePluginLayerId(name)
}

/** 清空测试用命名规则。 */
export function clearIndicatorLayerNamingForTest(): void {
  namingRules.clear()
}
