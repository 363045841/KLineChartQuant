/**
 * 指标渲染器导出入口
 */

import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'

// 主图指标图例（统一管理 MA、BOLL 等）
export { createMainIndicatorLegendLayer } from './mainIndicatorLegend/impl/createMainIndicatorLegendLayer.js'

/**
 * 副图指标类型
 */
export type SubIndicatorType = string

/**
 * 指标渲染器工厂选项：按实例身份创建渲染器 Layer 所需的输入。
 */
export interface IndicatorRendererOptions {
  /** 指标类型 */
  indicatorId: string
  /** 实例身份，渲染投影按该 ID 寻址。 */
  instanceId: string
  /** 目标 pane ID */
  paneId: string
  /** 指标元数据 */
  definition: IndicatorMetadata
  /** 初始配置 */
  params?: Record<string, unknown>
}
