/**
 * 指标渲染器导出入口
 */

import type { RendererPlugin } from '@/plugin'
import { createVolumeRendererPlugin } from '../subVolume'

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

/**
 * 副图指标类型
 */
export type SubIndicatorType = 'VOLUME' | 'MACD' | 'RSI' | 'CCI' | 'STOCH' | 'MOM' | 'WMSR' | 'KST' | 'FASTK' | 'ATR'

/**
 * 渲染器工厂选项
 */
export interface IndicatorRendererOptions {
    /** 指标类型 */
    indicatorId: SubIndicatorType
    /** 目标 pane ID */
    paneId: string
}

// 导入各个创建函数用于工厂函数
import { createMACDRendererPlugin } from './macd'
import { createRSIRendererPlugin } from './rsi'
import { createCCIRendererPlugin } from './cci'
import { createSTOCHRendererPlugin } from './stoch'
import { createMOMRendererPlugin } from './mom'
import { createWMSRRendererPlugin } from './wmsr'
import { createKSTRendererPlugin } from './kst'
import { createFASTKRendererPlugin } from './fastk'
import { createATRRendererPlugin } from './atr'

/**
 * 创建副图指标渲染器（统一工厂函数）
 */
export function createSubIndicatorRenderer(options: IndicatorRendererOptions): RendererPlugin {
    const { indicatorId, paneId } = options

    switch (indicatorId) {
        case 'VOLUME':
            return createVolumeRendererPlugin({ paneId })
        case 'MACD':
            return createMACDRendererPlugin({ paneId })
        case 'RSI':
            return createRSIRendererPlugin({ paneId })
        case 'CCI':
            return createCCIRendererPlugin({ paneId })
        case 'STOCH':
            return createSTOCHRendererPlugin({ paneId })
        case 'MOM':
            return createMOMRendererPlugin({ paneId })
        case 'WMSR':
            return createWMSRRendererPlugin({ paneId })
        case 'KST':
            return createKSTRendererPlugin({ paneId })
        case 'FASTK':
            return createFASTKRendererPlugin({ paneId })
        case 'ATR':
            return createATRRendererPlugin({ paneId })
        default:
            throw new Error(`Unknown indicator: ${indicatorId}`)
    }
}
