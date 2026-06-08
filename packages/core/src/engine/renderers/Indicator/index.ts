/**
 * 指标渲染器导出入口
 */

import type { RendererPlugin } from '../../../plugin'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata'

// MA 均线
export { createMARendererPlugin, type MAFlags } from './ma'

// BOLL 布林带
export { createBOLLRendererPlugin } from './boll'

// EXPMA 指数平滑移动平均线
export { createEXPMARendererPlugin } from './expma'

// ENE 轨道线
export { createENERendererPlugin } from './ene'

// 主图指标图例（统一管理 MA、BOLL 等）
export { createMainIndicatorLegendRendererPlugin } from './mainIndicatorLegend'

// MACD
export { createMACDRendererPlugin, calcMACDAtIndex, type MACDConfig, type MACDRendererOptions, getMACDTitleInfo } from './macd'
export { createMACDLegendRendererPlugin, type MACDLegendOptions } from './macdLegend'

// RSI 相对强弱指标
export { createRSIRendererPlugin, type RSIRendererOptions, getRSITitleInfo } from './rsi'

// CCI 顺势指标
export { createCCIRendererPlugin, type CCIRendererOptions, getCCITitleInfo } from './cci'

// STOCH 随机指标
export { createSTOCHRendererPlugin, type STOCHRendererOptions, getSTOCHTitleInfo } from './stoch'

// MOM 动量指标
export { createMOMRendererPlugin, type MOMRendererOptions, getMOMTitleInfo } from './mom'

// WMSR 威廉指标
export { createWMSRRendererPlugin, type WMSRRendererOptions, getWMSRTitleInfo } from './wmsr'

// KST 确知指标
export { createKSTRendererPlugin, type KSTRendererOptions, getKSTTitleInfo } from './kst'

// FASTK 快速随机指标
export { createFASTKRendererPlugin, type FASTKRendererOptions, getFASTKTitleInfo } from './fastk'

// ATR 平均真实波幅
export { createATRRendererPlugin, type ATRRendererOptions, getATRTitleInfo } from './atr'

// WMA 加权移动平均
export { createWMARendererPlugin } from './wma'
// DEMA 双指数移动平均
export { createDEMARendererPlugin } from './dema'
// TEMA 三指数移动平均
export { createTEMARendererPlugin } from './tema'
// HMA 赫尔移动平均
export { createHMARendererPlugin } from './hma'
// KAMA 考夫曼自适应移动平均
export { createKAMARendererPlugin } from './kama'
// SAR 抛物线转向
export { createSARRendererPlugin } from './sar'
// SuperTrend 超级趋势
export { createSuperTrendRendererPlugin } from './supertrend'
// Keltner 肯特纳通道
export { createKeltnerRendererPlugin } from './keltner'
// Donchian 唐奇安通道
export { createDonchianRendererPlugin } from './donchian'
// Ichimoku 一目均衡表
export { createIchimokuRendererPlugin } from './ichimoku'
// ROC 变化率
export { createROCRendererPlugin } from './roc'
// TRIX 三重指数平滑平均
export { createTRIXRendererPlugin } from './trix'
// HV 历史波动率
export { createHVRendererPlugin } from './hv'
// Parkinson 帕金森波动率
export { createParkinsonRendererPlugin } from './parkinson'
// Chaikin Vol 蔡金波动率
export { createChaikinVolRendererPlugin } from './chaikinVol'
// VMA 成交量移动平均
export { createVMARendererPlugin } from './vma'
// OBV 能量潮
export { createOBVRendererPlugin } from './obv'
// PVT 价量趋势
export { createPVTRendererPlugin } from './pvt'
// VWAP 成交量加权均价
export { createVWAPRendererPlugin } from './vwap'
// CMF 蔡金资金流
export { createCMFRendererPlugin } from './cmf'
// MFI 资金流量指数
export { createMFIRendererPlugin } from './mfi'
// Pivot Points 枢轴点
export { createPivotRendererPlugin } from './pivot'
// Fibonacci 斐波那契
export { createFibRendererPlugin } from './fib'
// SMC Structure 结构
export { createStructureRendererPlugin } from './structure'
// SMC Zones 区域
export { createZonesRendererPlugin } from './zones'
// Volume Profile 成交量分布
export { createVolumeProfileRendererPlugin } from './volumeProfile'

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
