/**
 * 指标渲染器导出入口
 */

import type { RendererPlugin } from '../../../foundation/plugin/index'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata'

// 主图指标图例（统一管理 MA、BOLL 等）
export { createMainIndicatorLegendRendererPlugin } from './mainIndicatorLegend'

/**
 * 副图指标类型
 */
export type SubIndicatorType = string

/**
 * 渲染器工厂选项
 */
export interface IndicatorRendererOptions {
  /** 指标类型 */
  indicatorId: string
  /** 目标 pane ID */
  paneId: string
  /** 指标元数据 */
  definition: IndicatorMetadata
  /** 初始配置 */
  params?: Record<string, unknown>
}

/**
 * 创建副图指标渲染器（统一工厂函数）
 */
export function createSubIndicatorRenderer(options: IndicatorRendererOptions): RendererPlugin {
  const { indicatorId, paneId, definition, params } = options
  return definition.rendererFactory({ paneId, indicatorId, params })
}
