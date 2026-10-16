/**
 * 指标渲染器导出入口
 */

import type {
  IndicatorMetadata,
  IndicatorRendererOptions as RendererOptions,
} from '../../indicators/indicatorMetadata.js'

// 主图指标图例（统一管理 MA、BOLL 等）

/**
 * 副图指标类型
 */
export type SubIndicatorType = string

/**
 * 指标渲染器工厂选项：按实例身份创建渲染器 Layer 所需的输入。
 */
export interface IndicatorRendererOptions extends RendererOptions {
  /** 指标元数据 */
  definition: IndicatorMetadata
}
