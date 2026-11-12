/**
 * 买卖量采集编排：拉 K 线 → 只留已收盘的柱 → 拆分校验 → 按天落盘 → 读回校验。
 *
 * 只落**已收盘**的 K 线：币安返回的最后一行是当前未收盘的柱，成交量还在增长；
 * 若把它写进去，按 openTime 去重会让这条「半截数据」永久留在盘上。
 * 未收盘柱在下一轮采集时已收盘，会以完整值写入。
 *
 * 落盘流为 `volume/{SYMBOL}/{interval}`，按 K 线开盘时刻归入 UTC 天分片。
 * 重复拉取同一批已收盘 K 线不会产生重复行（存储层按 openTime 去重）。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { DayAppendResult, DayShardStore } from '../../storage/types'
import type { BinanceClient, VolumeBar, VolumeBarRecord, VolumeInterval } from '../types'

/** 买卖量流前缀。 */
export const VOLUME_STREAM_PREFIX = 'volume'

/** 采集请求。 */
export interface CollectVolumeRequest {
  /** 币安客户端 */
  readonly client: BinanceClient
  /** 分片存储 */
  readonly store: DayShardStore
  /** 交易对列表 */
  readonly symbols: readonly string[]
  /** 周期列表 */
  readonly intervals: readonly VolumeInterval[]
  /** 每个周期拉取根数 */
  readonly limit: number
  /** 采集时钟（毫秒），用于判定哪些柱已经收盘；测试可注入 */
  readonly now: () => number
}

/** 单个交易对 + 周期的采集结果。 */
export interface CollectedVolumeSeries {
  /** 交易对 */
  readonly symbol: string
  /** 周期 */
  readonly interval: VolumeInterval
  /** 已收盘并参与写入的 K 线根数 */
  readonly barCount: number
  /** 最近一根 K 线的开盘时刻；无数据时为 null */
  readonly latestOpenTime: number | null
  /** 每个分片的写入结果 */
  readonly appends: readonly DayAppendResult[]
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
  /** 读回校验是否通过；无数据时为 false */
  readonly readBackVerified: boolean
}

/**
 * 取某交易对某周期的流标识。
 *
 * @param symbol 交易对
 * @param interval 周期
 * @returns 流标识
 */
function volumeStream(symbol: string, interval: VolumeInterval): string {
  return `${VOLUME_STREAM_PREFIX}/${symbol}/${interval}`
}

/**
 * 判断一根柱是否已经收盘。
 *
 * @param bar K 线
 * @param nowMs 当前毫秒
 * @returns 收盘时刻早于当前时刻时为 true
 */
function isClosed(bar: VolumeBar, nowMs: number): boolean {
  return bar.closeTime < nowMs
}

/**
 * 采集指定交易对与周期的 K 线买卖量。
 *
 * @param request 客户端、存储、交易对、周期、根数与时钟
 * @returns 每个交易对 + 周期的采集结果
 * @throws AnalyticsError 网络失败、拆分不守恒或写入失败
 */
export async function collectVolumeSeries(
  request: CollectVolumeRequest,
): Promise<readonly CollectedVolumeSeries[]> {
  const collected: CollectedVolumeSeries[] = []

  for (const symbol of request.symbols) {
    for (const interval of request.intervals) {
      const result = await request.client.getKlines({
        symbol,
        interval,
        limit: request.limit,
      })
      const nowMs = request.now()
      const closedBars = result.bars.filter((bar) => isClosed(bar, nowMs))
      const records: VolumeBarRecord[] = closedBars.map((bar) => ({
        schemaVersion: 1,
        symbol,
        interval,
        ...bar,
      }))

      const stream = volumeStream(symbol, interval)
      const appends = request.store.append({
        stream,
        rows: records,
        dayOf: (row) => row.openTime,
        dedupeKey: (row) => String(row.openTime),
      })

      const latest = records[records.length - 1]
      let readBackVerified = false
      if (latest !== undefined && appends.length > 0) {
        const lastAppend = appends[appends.length - 1]
        const stored = request.store.read<VolumeBarRecord>({
          stream,
          day: lastAppend.day,
        })
        const persisted = stored.find((row) => row.openTime === latest.openTime)
        const expectedText = JSON.stringify(latest)
        const actualText = persisted === undefined ? null : JSON.stringify(persisted)
        readBackVerified = actualText === expectedText
        if (!readBackVerified) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.STORAGE_WRITE_FAILED,
            `买卖量读回校验失败：${stream}/${lastAppend.day}`,
            {
              stream,
              day: lastAppend.day,
              openTime: latest.openTime,
              expected: expectedText,
              actual: actualText,
            },
          )
        }
      }

      collected.push({
        symbol,
        interval,
        barCount: records.length,
        latestOpenTime: latest?.openTime ?? null,
        appends,
        elapsedMs: result.elapsedMs,
        readBackVerified,
      })
    }
  }

  return collected
}
