/**
 * cloudtrade 历史数据迁移契约。
 *
 * 迁移目标：把 cloudtrade 已积累的期权聚合位与买卖量导入分析数据目录，
 * 并显式标注「非等间隔快照，不能当统计样本」。
 *
 * 迁移数据写入 `legacy/` 子树，与实时采集流物理隔离：
 * - `legacy/options-levels/{BTCUSD|ETHUSD}`：cloudtrade 期权聚合位
 * - `legacy/volume/{BTCUSDT|ETHUSDT}/{interval}`：cloudtrade 买卖量
 */

import type { VolumeInterval } from '../volume/types'

/** 迁移数据的来源标记。 */
export type LegacyDataSource = 'cloudtrade'

/** 迁移后的期权聚合位记录。字段名与实时聚合位对齐，缺失项保留 null。 */
export interface LegacyOptionLevelRecord {
  /** 记录结构版本 */
  readonly schemaVersion: 1
  /** 数据来源 */
  readonly source: LegacyDataSource
  /** 来源符号，例如 `BTCUSD` */
  readonly symbol: string
  /** 标的 */
  readonly currency: 'BTC' | 'ETH'
  /** 快照采集时刻（毫秒，来自 ts） */
  readonly capturedAt: number
  /** 数据生成时刻（毫秒，来自 src）；源缺失时为 null */
  readonly sourceTimestamp: number | null
  /** Gamma 翻转位 */
  readonly gammaFlipUsd: number | null
  /** Call 墙 */
  readonly callWallUsd: number | null
  /** Put 墙 */
  readonly putWallUsd: number | null
  /** 最大痛点 */
  readonly maxPainUsd: number | null
  /** 现货价 */
  readonly spotUsd: number | null
  /** 采样说明：该条来自非等间隔快照，不能当统计样本 */
  readonly samplingNote: string
}

/** 迁移后的买卖量记录。字段沿用 cloudtrade 原始四元组语义。 */
export interface LegacyVolumeBarRecord {
  /** 记录结构版本 */
  readonly schemaVersion: 1
  /** 数据来源 */
  readonly source: LegacyDataSource
  /** 交易对，例如 `BTCUSDT` */
  readonly symbol: string
  /** K 线周期 */
  readonly interval: VolumeInterval
  /** 开盘时刻（毫秒） */
  readonly openTime: number
  /** 主动买入量（源文件第 2 字段） */
  readonly buyVolume: number
  /** 主动卖出量（源文件第 3 字段） */
  readonly sellVolume: number
  /** 成交额（源文件第 4 字段） */
  readonly turnover: number
  /** 源文件 `volume_rev`：口径版本，消费方据此判断单位 */
  readonly sourceRevision: number
}

/** cloudtrade 期权原始记录（与 jsonl 字段一一对应）。 */
export interface CloudtradeOptionRecord {
  /** 来源符号 */
  readonly symbol: string
  /** 快照时刻 ISO 字符串 */
  readonly ts: string
  /** 数据生成时刻 ISO 字符串 */
  readonly src: string | null
  /** Gamma 翻转位 */
  readonly gammaFlip: number | null
  /** Call 墙 */
  readonly callWall: number | null
  /** Put 墙 */
  readonly putWall: number | null
  /** 最大痛点 */
  readonly maxPain: number | null
  /** 现货价 */
  readonly spot: number | null
}

/** 单条源文件读取结果。 */
export interface CloudtradeOptionSource {
  /** 读取过的文件绝对路径 */
  readonly files: readonly string[]
  /** 目标符号的记录（已去重前的原始集合） */
  readonly records: readonly CloudtradeOptionRecord[]
  /** 被忽略的非目标符号记录数 */
  readonly skippedNonTargetRecords: number
}

/** cloudtrade 买卖量文件。 */
export interface CloudtradeVolumeSource {
  /** 文件绝对路径 */
  readonly path: string
  /** 来源符号 */
  readonly symbol: string
  /** 对应的币安交易对 */
  readonly binanceSymbol: string
  /** 口径版本 */
  readonly volumeRev: number
  /** 文件更新时间（毫秒） */
  readonly updatedAt: number
  /** 周期 → 柱序列，每根柱为 `[秒级时间戳, 买量, 卖量, 成交额]` */
  readonly intervals: ReadonlyMap<string, readonly (readonly number[])[]>
}

/** 迁移来源符号 → 业务符号映射。 */
export const CLOUDTRADE_SYMBOL_MAP: Readonly<
  Record<string, { readonly currency: 'BTC' | 'ETH'; readonly binanceSymbol: string }>
> = {
  BTCUSD: { currency: 'BTC', binanceSymbol: 'BTCUSDT' },
  ETHUSD: { currency: 'ETH', binanceSymbol: 'ETHUSDT' },
}

/** 参与迁移的来源符号。 */
export const CLOUDTRADE_OPTION_SYMBOLS: readonly string[] = Object.keys(CLOUDTRADE_SYMBOL_MAP)

/** 迁移数据必须携带的采样说明。 */
export const CLOUDTRADE_SAMPLING_NOTE =
  'cloudtrade 聚合位为非等间隔快照（实测间隔中位约 16 分钟、p90 约 64 分钟），不能当统计样本'

/** 单一来源符号的采样节奏统计。 */
export interface CadenceStats {
  /** 来源符号 */
  readonly symbol: string
  /** 去重后的快照数 */
  readonly uniqueSnapshots: number
  /** 原始记录数 */
  readonly rawRecords: number
  /** 因重复写入丢弃的记录数 */
  readonly duplicateRecords: number
  /** 覆盖起始日（UTC 日期） */
  readonly firstDay: string
  /** 覆盖结束日（UTC 日期） */
  readonly lastDay: string
  /** 相邻唯一快照的间隔中位数（分钟） */
  readonly gapMedianMinutes: number
  /** 相邻唯一快照间隔的 90 分位（分钟） */
  readonly gapP90Minutes: number
  /** 最大间隔（分钟） */
  readonly gapMaxMinutes: number
  /** 单日快照数的中位数 */
  readonly snapshotsPerDayMedian: number
}

/** 单个周期导入统计。 */
export interface VolumeIntervalImport {
  /** 周期 */
  readonly interval: VolumeInterval
  /** 源柱数 */
  readonly bars: number
  /** 第一条时间（毫秒） */
  readonly firstOpenTime: number
  /** 最后一条时间（毫秒） */
  readonly lastOpenTime: number
}

/** 迁移清单：记录来源、数量、采样说明与丢弃原因。 */
export interface MigrationManifest {
  /** 清单结构版本 */
  readonly schemaVersion: 1
  /** 生成时刻（毫秒） */
  readonly generatedAt: number
  /** cloudtrade 数据根目录 */
  readonly cloudtradeHome: string
  /** 迁移输出根目录 */
  readonly outputRoot: string
  /** 期权部分 */
  readonly options: {
    readonly files: readonly string[]
    readonly recordsImported: number
    readonly duplicatesDropped: number
    readonly skippedNonTargetRecords: number
    readonly cadence: readonly CadenceStats[]
  }
  /** 买卖量部分 */
  readonly volume: {
    readonly files: readonly string[]
    readonly barsImported: number
    readonly series: readonly {
      readonly symbol: string
      readonly volumeRev: number
      readonly intervals: readonly VolumeIntervalImport[]
    }[]
  }
  /** 迁移注意事项，供后续分析消费方读取 */
  readonly caveats: readonly string[]
}

/** 迁移执行结果。 */
export interface MigrationResult {
  /** 清单 */
  readonly manifest: MigrationManifest
  /** 清单文件绝对路径 */
  readonly manifestPath: string
  /** 期权写入的分片结果数 */
  readonly optionShardWrites: number
  /** 买卖量写入的分片结果数 */
  readonly volumeShardWrites: number
}
