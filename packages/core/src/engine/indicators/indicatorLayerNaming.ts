/**
 * 指标渲染 Layer 命名：由定义自带的 renderer 解析器直接计算，不维护全局表。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { IndicatorRendererNameResolver } from './indicatorMetadata.js'

/** 将内部名和展示名转换为统一的查询键。 */
export function normalizeIndicatorId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** 按定义身份解析数据或坐标轴 Layer ID；实例图层必须带 instanceId 以保证多实例唯一。 */
export function createIndicatorLayerId(
  renderer: IndicatorRendererNameResolver,
  definitionId: string,
  paneId: string,
  instanceId?: string,
): string {
  const name = renderer({ paneId, indicatorId: definitionId, instanceId })
  if (!name) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `[Indicator] missing renderer identity for '${definitionId}'`,
    )
  }
  return makePluginLayerId(instanceId ? `${name}@${instanceId}` : name)
}
