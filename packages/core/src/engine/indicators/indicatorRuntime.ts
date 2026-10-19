/**
 * 指标计算函数映射。
 *
 * Worker 通过 computeKey 解析到具体 calculator；inline 路径直接使用各指标
 * metadata 的 runtime.compute，不经过本模块。
 */

import type { KLineData } from '../../foundation/types/price.js'

import {
  calcStructureData,
  calcVolumeProfileData,
  calcZonesData,
} from './calculators/index.js'

/** Worker 端 computeKey → calculator 的映射。 */
const CALCULATOR_MAP: Record<string, (data: KLineData[], config: any) => unknown> = {
  calcStructureData: (data, c) =>
    calcStructureData(data, c.leftWindow, c.rightWindow, c.breakoutSource),
  calcZonesData: (data, c) => calcZonesData(data, c.obLookback, 5, 2, 'close'),
  calcVolumeProfileData: (data, c) =>
    calcVolumeProfileData(data, c.bins, c.lookback, c.valueAreaPercent),
}

export function createWorkerCompute(descriptor: {
  computeKey: string
}): (data: KLineData[], config: any) => unknown {
  return (
    CALCULATOR_MAP[descriptor.computeKey] ??
    ((_data: KLineData[], _config: any) => {
      console.warn(`[IndicatorRuntime] Unknown computeKey: ${descriptor.computeKey}`)
      return []
    })
  )
}
