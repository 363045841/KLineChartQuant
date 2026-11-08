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
    .replace(/[^\p{L}\p{N}]/gu, '')
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

/** Layer 身份选项：取数据层还是坐标轴层，以及实例身份。 */
export interface IndicatorLayerIdOptions {
  readonly part?: 'renderer' | 'scale'
  /** 允许同一指标多实例的定义必须给出，否则多个实例会争用同一层。 */
  readonly instanceId?: string
  /** 同一面板内叠加了同定义的多个实例；即使定义未声明多实例也要带实例身份。 */
  readonly stacked?: boolean
}

/** 按定义身份解析数据或坐标轴 Layer ID；身份未登记时抛错。 */
export function resolveIndicatorLayerId(
  definitionId: string,
  paneId: string,
  options: IndicatorLayerIdOptions = {},
): string {
  const { part = 'renderer', instanceId, stacked } = options
  const rule = namingRules.get(normalizeIndicatorId(definitionId))
  const nameOptions = { paneId, indicatorId: definitionId, instanceId, stacked }
  const name = part === 'renderer' ? rule?.renderer(nameOptions) : rule?.scale(nameOptions)
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
