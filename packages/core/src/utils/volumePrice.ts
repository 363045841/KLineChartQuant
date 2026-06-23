import type { KLineData } from '../types/price'
import { VolumePriceRelation, type VolumePriceConfig, DEFAULT_VOLUME_PRICE_CONFIG } from '../types/volumePrice'

// 重新导出默认配置，方便外部使用
export { DEFAULT_VOLUME_PRICE_CONFIG }

/**
 * 成交量前缀和计算器
 * 用于优化成交量移动平均的计算，避免重复遍历
 */
class VolumePrefixSum {
  private prefixSum: number[] = []
  private dataLength: number = 0

  /**
   * 构建前缀和数组
   * @param data - K线数据数组
   */
  build(data: KLineData[]): void {
    const len = data.length
    if (len === 0) {
      this.prefixSum = []
      this.dataLength = 0
      return
    }

    this.prefixSum = [0]

    for (let i = 0; i < len; i++) {
      this.prefixSum.push(this.prefixSum[i]! + (data[i]?.volume ?? 0))
    }

    this.dataLength = len
  }

  /**
   * 查询区间 [start, end] 的成交量之和
   * @param start - 起始索引（包含）
   * @param end - 结束索引（包含）
   * @returns 区间成交量之和
   */
  query(start: number, end: number): number {
    if (start < 0 || end >= this.dataLength || start > end) {
      return 0
    }
    return this.prefixSum[end + 1]! - this.prefixSum[start]!
  }

  /**
   * 计算成交量移动平均
   * @param index - 当前K线索引
   * @param period - 计算周期
   * @returns 成交量移动平均值
   */
  getVolumeMA(index: number, period: number): number {
    if (index < period - 1) return 0
    const start = index - period + 1
    const sum = this.query(start, index)
    return sum / period
  }

  /**
   * 增量追加数据，避免全量重建
   * @param data - K线数据数组，仅追加超出 dataLength 的部分
   */
  append(data: KLineData[]): void {
    const newLen = data.length
    if (newLen <= this.dataLength) return
    for (let i = this.dataLength; i < newLen; i++) {
      this.prefixSum.push(this.prefixSum[this.prefixSum.length - 1]! + (data[i]?.volume ?? 0))
    }
    this.dataLength = newLen
  }

  /**
   * 获取数据长度
   */
  get length(): number {
    return this.dataLength
  }
}

// 全局前缀和实例（可选，用于简化调用）
let globalPrefixSum: VolumePrefixSum | null = null
let cachedData: KLineData[] | null = null

/**
 * 获取或创建前缀和实例
 * 检测数据引用是否变化，自动重建前缀和
 */
function getPrefixSum(data: KLineData[]): VolumePrefixSum {
  if (!globalPrefixSum || cachedData !== data || cachedData.length > data.length) {
    globalPrefixSum = new VolumePrefixSum()
    globalPrefixSum.build(data)
    cachedData = data
  } else if (cachedData.length < data.length) {
    // 数据追加：增量更新，避免 O(n) 重建
    globalPrefixSum.append(data)
    cachedData = data
  }

  return globalPrefixSum
}

/**
 * 计算量价关系
 *
 * @param data - K线数据数组
 * @param index - 要分析的K线索引
 * @param config - 量价关系计算配置
 * @returns 量价关系类型
 */
function analyzeVolumePriceRelation(
  data: KLineData[],
  index: number,
  config: VolumePriceConfig
): VolumePriceRelation {
  const curVolume = data[index]?.volume
  if (index < 1 || index >= data.length || !curVolume) {
    return VolumePriceRelation.OTHERS
  }

  const { volumeAmplifyThreshold, volumeShrinkThreshold, avgPeriod } = config

  // 使用前缀和优化计算 MA
  const prefixSum = getPrefixSum(data)
  const volumeMA = prefixSum.getVolumeMA(index, avgPeriod)

  // 判断价格方向
  const currentKLine = data[index]
  if (!currentKLine) return VolumePriceRelation.OTHERS
  const priceChange = currentKLine.close - currentKLine.open
  const isRising = priceChange > 0
  const isFalling = priceChange < 0

  // 判断成交量变化
  const isVolumeAmplified = curVolume > volumeMA * volumeAmplifyThreshold
  const isVolumeShrunk = curVolume < volumeMA * volumeShrinkThreshold

  // 1. 量价齐升（放量上涨）
  if (isRising && isVolumeAmplified) {
    return VolumePriceRelation.RISE_WITH_VOLUME
  }

  // 2. 量价背离（缩量上涨）
  if (isRising && isVolumeShrunk) {
    return VolumePriceRelation.RISE_WITHOUT_VOLUME
  }

  // 3. 量增价跌
  if (isFalling && isVolumeAmplified) {
    return VolumePriceRelation.FALL_WITH_VOLUME
  }

  // 4. 量缩价跌
  if (isFalling && isVolumeShrunk) {
    return VolumePriceRelation.FALL_WITHOUT_VOLUME
  }

  return VolumePriceRelation.OTHERS
}

/**
 * 批量计算量价关系（推荐用于渲染器中）
 * 显式传入前缀和实例，避免重复构建
 *
 * @param data - K线数据数组
 * @param startIndex - 起始索引
 * @param endIndex - 结束索引
 * @param config - 量价关系计算配置
 * @returns 量价关系数组
 */
export function analyzeVolumePriceRelationBatch(
  data: KLineData[],
  startIndex: number,
  endIndex: number,
  config: VolumePriceConfig = DEFAULT_VOLUME_PRICE_CONFIG
): VolumePriceRelation[] {
  const prefixSum = getPrefixSum(data)

  const results: VolumePriceRelation[] = []
  const { volumeAmplifyThreshold, volumeShrinkThreshold, avgPeriod } = config

  for (let index = startIndex; index < endIndex && index < data.length; index++) {
    const curVolume = data[index]?.volume
    if (index < 1 || !curVolume) {
      results.push(VolumePriceRelation.OTHERS)
      continue
    }

    const volumeMA = prefixSum.getVolumeMA(index, avgPeriod)
    const currentKLine = data[index]

    if (!currentKLine) {
      results.push(VolumePriceRelation.OTHERS)
      continue
    }

    const priceChange = currentKLine.close - currentKLine.open
    const isRising = priceChange > 0
    const isFalling = priceChange < 0
    const isVolumeAmplified = curVolume > volumeMA * volumeAmplifyThreshold
    const isVolumeShrunk = curVolume < volumeMA * volumeShrinkThreshold

    if (isRising && isVolumeAmplified) {
      results.push(VolumePriceRelation.RISE_WITH_VOLUME)
    } else if (isRising && isVolumeShrunk) {
      results.push(VolumePriceRelation.RISE_WITHOUT_VOLUME)
    } else if (isFalling && isVolumeAmplified) {
      results.push(VolumePriceRelation.FALL_WITH_VOLUME)
    } else if (isFalling && isVolumeShrunk) {
      results.push(VolumePriceRelation.FALL_WITHOUT_VOLUME)
    } else {
      results.push(VolumePriceRelation.OTHERS)
    }
  }

  return results
}