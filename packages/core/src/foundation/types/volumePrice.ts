/**
 * 量价关系类型枚举
 */
export enum VolumePriceRelation {
  /** 量价齐升（放量上涨）- 价格上涨且成交量显著放大 */
  RISE_WITH_VOLUME = 'rise_with_volume',
  /** 量价背离（缩量上涨）- 价格上涨但成交量萎缩 */
  RISE_WITHOUT_VOLUME = 'rise_without_volume',
  /** 量增价跌 - 价格下跌且成交量放大 */
  FALL_WITH_VOLUME = 'fall_with_volume',
  /** 量缩价跌 - 价格下跌且成交量萎缩 */
  FALL_WITHOUT_VOLUME = 'fall_without_volume',
  /** 中性状态 - 其他情况 */
  OTHERS = 'others',
}

/** 量价关系计算配置 */
export interface VolumePriceConfig {
  /** 成交量放大阈值（相对于均值的倍数） */
  volumeAmplifyThreshold: number
  /** 成交量萎缩阈值（相对于均值的倍数） */
  volumeShrinkThreshold: number
  /** 计算均值的周期 */
  avgPeriod: number
}

/** 默认量价关系计算配置 */
export const DEFAULT_VOLUME_PRICE_CONFIG: VolumePriceConfig = {
  volumeAmplifyThreshold: 1.5,
  volumeShrinkThreshold: 0.8,
  avgPeriod: 20,
}
